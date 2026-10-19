# Running vacdeck-pair for someone (AI agents)

You are helping a person add their robot vacuum to VacDeck. They gave you a pairing code from the
VacDeck page (`XXXXX-XXXXX`, valid one hour). The program does the pairing; your job is to collect
what it needs, run it once, and explain the result.

## 1. Ask everything first, in one message

While the program runs, **this computer leaves the internet for about a minute** (it joins the
robot's own Wi-Fi). You cannot talk to the person or to your model during that time, so ask before:

- the **2.4 GHz Wi-Fi** the robot should join — suggest the network this computer is on now;
- whether you may use the **password this computer already saved** for it (`--saved-password`;
  the system may show the person an approval dialog). Only if they say no, ask for the password;
- to **put the robot in pairing mode now**: hold the Home/Dock button about 3 seconds (some models:
  Clean + Dock together) until the robot says it is ready to connect, and keep the computer within a
  few meters of the robot.

## 2. Download the program for this computer

Releases: <https://github.com/leduyphuc1702/vacdeck-pair/releases/latest>

- Windows (PowerShell):

  ```powershell
  Invoke-WebRequest -UseBasicParsing -OutFile "$env:TEMP\vacdeck-pair.exe" `
    https://github.com/leduyphuc1702/vacdeck-pair/releases/latest/download/vacdeck-pair-windows-x64.exe
  ```

- macOS / Linux:

  ```sh
  curl -fsSL -o "${TMPDIR:-/tmp}/vacdeck-pair" "https://github.com/leduyphuc1702/vacdeck-pair/releases/latest/download/vacdeck-pair-$(uname -s | tr A-Z a-z)-$(uname -m | sed -e s/x86_64/x64/ -e s/aarch64/arm64/)" && chmod +x "${TMPDIR:-/tmp}/vacdeck-pair"
  ```

Optionally check it against `SHA256SUMS` from the same release.

## 3. Run it once, in the foreground

```sh
vacdeck-pair CODE --json --max-minutes 9 --ssid "WIFI NAME" --saved-password
```

- Give the command a timeout of **at least 10 minutes**. Do not run it in the background, do not stop
  it, and run nothing else until it ends: it reconnects to the home Wi-Fi by itself.
- If the person typed the password instead, drop `--saved-password` and pass the password **only** in
  the environment variable `VACDECK_WIFI_PASSWORD` for this one command. Never put it in an argument
  or a file, and never repeat it back.
- Your sandbox must allow network access and Wi-Fi changes for this command; if it does not, ask the
  person to allow it.

## 4. Read the last line

Every line is JSON. The last one is the result:

```json
{"event":"result","ok":false,"reason":"hotspot_not_found","message":"…","next":"retry","log":"…","issues":"…"}
```

| `next` | Do |
|---|---|
| `null` (`ok: true`) | Tell the person the robot is in VacDeck (`name`) and that they can go back to the VacDeck page. |
| `ask_ssid` / `ask_password` | Ask for the missing or wrong Wi-Fi name or password, then run step 3 again. |
| `retry` | Explain `message`, have the person put the robot in pairing mode again, run step 3 again. |
| `run_again` | The robot is paired; run the exact same command again (it continues reporting). |
| `new_code` | The code expired or was used: ask for a new code from the VacDeck page. |
| `report_issue` | Explain `message`, then help the person open an issue at `issues` and attach the file at `log` (it has no password). |

## Rules

- Use this program only with the code the person gave you. Do not scan networks, change other
  settings, or install anything else.
- Do not post the Wi-Fi password or the pairing code anywhere, including issues.
