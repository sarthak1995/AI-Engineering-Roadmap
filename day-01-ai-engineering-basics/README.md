# Basic OpenAI Python Chat App

A small command-line chat app that uses the OpenAI Python SDK and the Responses API.

## Setup

Create and activate a virtual environment:

```bash
python3 -m venv .venv
source .venv/bin/activate
```

Install dependencies:

```bash
pip install -r requirements.txt
```

Set your API key:

```bash
export OPENAI_API_KEY="your_api_key_here"
```

Optionally choose a model:

```bash
export OPENAI_MODEL="gpt-4.1"
```

Tune creativity and response length:

```bash
export OPENAI_TEMPERATURE="0.7"
export OPENAI_MAX_OUTPUT_TOKENS="500"
```

Lower temperature values are more predictable. Higher values are more creative.
`OPENAI_MAX_OUTPUT_TOKENS` controls the maximum response length.

Streaming is enabled by default. The app first shows `Assistant: Thinking...`.
Normal chat responses then stream immediately. Notification-like requests use
the first call to inspect the tool call cleanly, then stream the final assistant
reply after any approval flow.

```bash
export OPENAI_STREAM="true"
```

To wait for the full response before printing it:

```bash
export OPENAI_STREAM="false"
```

## Human-in-the-loop Pushover approval

Set your Pushover credentials:

```bash
export PUSHOVER_APP_TOKEN="your_pushover_app_token_here"
export PUSHOVER_USER_KEY="your_pushover_user_key_here"
```

Then ask naturally in chat:

```text
Send me a Pushover notification that says the build is done.
Notify me that the deployment finished.
Remind me to check the logs.
Ping me: meeting starts in 10 minutes.
```

For notification-like messages, the app nudges the model into the
`send_pushover_notification` tool so the request behaves like a natural chat
command. Before the tool sends anything, the app shows the proposed action and
asks for approval:

```text
Human approval required
Action: Send Pushover notification: the build is done
Approve? [y/N]:
```

It sends the Pushover notification only if you approve with `y` or `yes`.

You can also use the direct shortcut:

```text
/notify message to send
```

## Run

```bash
python openai_chat.py
```

Type `exit` or `quit` to stop the chat.
