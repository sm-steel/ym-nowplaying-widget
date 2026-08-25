"""One-time interactive helper: mints a Yandex Music OAuth token via device-auth flow.

Run with: uv run python scripts/get_token.py
(or: python scripts/get_token.py, after `pip install yandex-music`)

Prints the token — paste it into Vercel as the YM_TOKEN env var
(`vercel env add YM_TOKEN production`). Never commit it.
"""

from yandex_music import Client


def on_code(code):
    print(f"Open {code.verification_url} and enter code: {code.user_code}")
    print(f"Code is valid for {code.expires_in} seconds")


if __name__ == "__main__":
    client = Client()
    token = client.device_auth(on_code=on_code)
    client.init()

    login = client.me.account.login if client.me and client.me.account else "?"
    expires_in = token.expires_in or 0

    print()
    print(f"Logged in as: {login}")
    print(f"access_token:  {token.access_token}")
    print(f"expires_in:    {expires_in} sec (~{expires_in // 86400} days)")
    print()
    print("Set this as YM_TOKEN in Vercel — don't commit it anywhere.")
