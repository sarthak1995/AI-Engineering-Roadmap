import json
import os
import sys
from urllib import error, parse, request

try:
    from openai import APIError, AuthenticationError, OpenAI, RateLimitError
except ModuleNotFoundError:
    print(
        "Missing dependency: install the OpenAI SDK with `pip install -r requirements.txt`.",
        file=sys.stderr,
    )
    raise SystemExit(1)


DEFAULT_MODEL = "gpt-4.1"
DEFAULT_TEMPERATURE = 0.7
DEFAULT_MAX_OUTPUT_TOKENS = 500
DEFAULT_STREAM = True
MAX_TOOL_LOOPS = 5
PUSHOVER_API_URL = "https://api.pushover.net/1/messages.json"
INSTRUCTIONS = (
    "You are a concise, helpful assistant. Ask a clarifying question when the "
    "user's request is ambiguous, and otherwise answer directly. If the user "
    "asks you to send a phone notification, reminder, alert, or Pushover "
    "message, use the send_pushover_notification tool with the exact message "
    "that should be sent."
)
TOOLS = [
    {
        "type": "function",
        "name": "send_pushover_notification",
        "description": (
            "Send a Pushover notification to the user. The app will ask the "
            "human for approval before the notification is actually sent."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "message": {
                    "type": "string",
                    "description": "The notification message to send.",
                },
            },
            "required": ["message"],
            "additionalProperties": False,
        },
        "strict": True,
    },
]
NOTIFICATION_INTENT_TERMS = (
    "notify",
    "notification",
    "pushover",
    "alert",
    "remind me",
    "reminder",
    "ping me",
    "send me a message",
    "send my phone",
)


def get_float_env(name: str, default: float) -> float:
    value = os.getenv(name)
    if value is None:
        return default

    try:
        return float(value)
    except ValueError:
        print(f"{name} must be a number. Got: {value}", file=sys.stderr)
        raise SystemExit(1)


def get_int_env(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None:
        return default

    try:
        parsed = int(value)
    except ValueError:
        print(f"{name} must be an integer. Got: {value}", file=sys.stderr)
        raise SystemExit(1)

    if parsed < 1:
        print(f"{name} must be at least 1. Got: {value}", file=sys.stderr)
        raise SystemExit(1)

    return parsed


def get_bool_env(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default

    normalized = value.strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False

    print(
        f"{name} must be true or false. Got: {value}",
        file=sys.stderr,
    )
    raise SystemExit(1)


def get_text(response) -> str:
    """Return SDK helper text when available, otherwise extract text manually."""
    if getattr(response, "output_text", None):
        return response.output_text

    parts: list[str] = []
    for item in getattr(response, "output", []) or []:
        for content in getattr(item, "content", []) or []:
            text = getattr(content, "text", None)
            if text:
                parts.append(text)
    return "\n".join(parts).strip()


def stream_text_response(client: OpenAI, *, print_prefix: bool = True, **request_kwargs):
    stream = client.responses.create(stream=True, **request_kwargs)
    text_parts: list[str] = []
    completed_response = None
    did_print_text = False

    for event in stream:
        event_type = getattr(event, "type", "")

        if event_type == "response.output_text.delta":
            delta = getattr(event, "delta", "")
            if delta:
                if print_prefix and not did_print_text:
                    print("Assistant: ", end="", flush=True)
                text_parts.append(delta)
                print(delta, end="", flush=True)
                did_print_text = True

        elif event_type == "response.completed":
            completed_response = getattr(event, "response", None)

        elif event_type == "error":
            error = getattr(event, "error", None)
            raise RuntimeError(f"Streaming error: {error}")

    if did_print_text:
        print()
    return completed_response, "".join(text_parts).strip()


def require_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        print(f"Missing {name}. Set it before sending a Pushover notification.")
        raise ValueError(name)
    return value


def ask_for_approval(action: str) -> bool:
    print("\nHuman approval required")
    print(f"Action: {action}")
    answer = input("Approve? [y/N]: ").strip().lower()
    return answer in {"y", "yes"}


def send_pushover_notification(message: str) -> str:
    token = require_env("PUSHOVER_APP_TOKEN")
    user = require_env("PUSHOVER_USER_KEY")

    payload = parse.urlencode(
        {
            "token": token,
            "user": user,
            "title": "OpenAI Chat App",
            "message": message,
        }
    ).encode("utf-8")

    pushover_request = request.Request(
        PUSHOVER_API_URL,
        data=payload,
        method="POST",
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )

    try:
        with request.urlopen(pushover_request, timeout=10) as response:
            if response.status != 200:
                return f"failed: Pushover returned HTTP {response.status}"
    except error.HTTPError as exc:
        return f"failed: Pushover HTTP error {exc.code}"
    except error.URLError as exc:
        return f"failed: Pushover network error {exc.reason}"

    return "success: Pushover notification sent"


def handle_notification_command(command: str) -> None:
    message = command.removeprefix("/notify").strip()
    if not message:
        print("Usage: /notify message to send")
        return

    if ask_for_approval(f"Send Pushover notification: {message}"):
        try:
            result = send_pushover_notification(message)
        except ValueError as exc:
            result = f"failed: missing environment variable {exc}"
        print(result)
    else:
        print("Notification cancelled.")


def call_tool(name: str, arguments: dict) -> str:
    if name != "send_pushover_notification":
        return f"failed: unknown tool {name}"

    message = str(arguments.get("message", "")).strip()
    if not message:
        return "failed: message is required"

    if not ask_for_approval(f"Send Pushover notification: {message}"):
        return "cancelled: human did not approve the notification"

    try:
        return send_pushover_notification(message)
    except ValueError as exc:
        return f"failed: missing environment variable {exc}"


def get_function_calls(response) -> list:
    return [
        item
        for item in getattr(response, "output", []) or []
        if getattr(item, "type", None) == "function_call"
    ]


def wants_notification(user_input: str) -> bool:
    normalized = user_input.lower()
    return any(term in normalized for term in NOTIFICATION_INTENT_TERMS)


def run_chat_turn(client: OpenAI, request_kwargs: dict, stream: bool):
    current_kwargs = dict(request_kwargs)
    pause_first_call_for_tool_choice = "tool_choice" in current_kwargs

    print("Assistant: Thinking...", flush=True)

    for loop_index in range(MAX_TOOL_LOOPS):
        should_stream = stream and (
            loop_index > 0 or not pause_first_call_for_tool_choice
        )
        if should_stream:
            response, streamed_answer = stream_text_response(
                client,
                tools=TOOLS,
                parallel_tool_calls=False,
                **current_kwargs,
            )
        else:
            response = client.responses.create(
                tools=TOOLS,
                parallel_tool_calls=False,
                **current_kwargs,
            )
            streamed_answer = ""

        if response is None:
            return response, streamed_answer

        function_calls = get_function_calls(response)

        if not function_calls:
            answer = get_text(response)
            if should_stream:
                if not streamed_answer:
                    print(f"Assistant: {answer or '[No text response]'}")
                return response, streamed_answer or answer

            print(f"Assistant: {answer or '[No text response]'}")
            return response, answer

        tool_outputs = []
        for tool_call in function_calls:
            try:
                arguments = json.loads(tool_call.arguments or "{}")
            except json.JSONDecodeError:
                arguments = {}

            result = call_tool(tool_call.name, arguments)
            tool_outputs.append(
                {
                    "type": "function_call_output",
                    "call_id": tool_call.call_id,
                    "output": result,
                }
            )

        current_kwargs = {
            key: value
            for key, value in current_kwargs.items()
            if key not in {"input", "previous_response_id", "tool_choice"}
        }
        current_kwargs["previous_response_id"] = response.id
        current_kwargs["input"] = tool_outputs

    raise RuntimeError("Stopped after too many tool-call loops.")


def main() -> int:
    if not os.getenv("OPENAI_API_KEY"):
        print("Missing OPENAI_API_KEY. Set it before running the app.", file=sys.stderr)
        return 1

    client = OpenAI()
    model = os.getenv("OPENAI_MODEL", DEFAULT_MODEL)
    temperature = get_float_env("OPENAI_TEMPERATURE", DEFAULT_TEMPERATURE)
    max_output_tokens = get_int_env(
        "OPENAI_MAX_OUTPUT_TOKENS", DEFAULT_MAX_OUTPUT_TOKENS
    )
    stream = get_bool_env("OPENAI_STREAM", DEFAULT_STREAM)
    previous_response_id = None

    print(f"OpenAI chat app using {model}")
    print(f"Temperature: {temperature}")
    print(f"Max output tokens: {max_output_tokens}")
    print(f"Streaming: {stream}")
    print("Ask naturally for a Pushover notification to trigger approval.")
    print("You can also use /notify your message for a direct approval shortcut.")
    print("Type 'exit', 'quit', or press Ctrl+C to stop.\n")

    while True:
        try:
            user_input = input("You: ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nGoodbye.")
            return 0

        if not user_input:
            continue

        if user_input.lower() in {"exit", "quit"}:
            print("Goodbye.")
            return 0

        if user_input.startswith("/notify"):
            handle_notification_command(user_input)
            print()
            continue

        request_kwargs = {
            "model": model,
            "instructions": INSTRUCTIONS,
            "input": user_input,
            "previous_response_id": previous_response_id,
            "temperature": temperature,
            "max_output_tokens": max_output_tokens,
        }
        if wants_notification(user_input):
            request_kwargs["tool_choice"] = {
                "type": "function",
                "name": "send_pushover_notification",
            }

        try:
            response, answer = run_chat_turn(client, request_kwargs, stream)
        except AuthenticationError:
            print("Authentication failed. Check your OPENAI_API_KEY.", file=sys.stderr)
            continue
        except RateLimitError:
            print("Rate limit reached. Try again later.", file=sys.stderr)
            continue
        except APIError as exc:
            print(f"OpenAI API error: {exc}", file=sys.stderr)
            continue
        except RuntimeError as exc:
            print(exc, file=sys.stderr)
            continue

        if response is not None:
            previous_response_id = response.id

        if not answer:
            print("[No text response]")

        print()


if __name__ == "__main__":
    raise SystemExit(main())
