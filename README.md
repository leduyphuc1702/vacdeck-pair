# vacdeck-pair

Adds a Dreame, MOVA or Trouver robot vacuum to [VacDeck](https://vacdeck.com) when the robot
cannot scan a QR code (no camera). Run it on a computer with Wi-Fi, a few meters from the robot.

[Tiếng Việt](#tiếng-việt) · [Русский](#русский)

## How to use

1. On the VacDeck page, choose **Add a robot → Pair with a computer**. Copy the pairing code
   (looks like `K7QM4-XZP2A`, valid for one hour).
2. Download the program for your computer from the
   [latest release](https://github.com/leduyphuc1702/vacdeck-pair/releases/latest):

   | Computer | File |
   |---|---|
   | Windows | `vacdeck-pair-windows-x64.exe` |
   | Mac with Apple chip (M1–M4) | `vacdeck-pair-darwin-arm64` |
   | Mac with Intel chip | `vacdeck-pair-darwin-x64` |
   | Linux | `vacdeck-pair-linux-x64` / `vacdeck-pair-linux-arm64` |

3. Run it and paste the code:
   - **Windows:** double-click the `.exe`. If Windows says "Windows protected your PC", click
     **More info → Run anyway** (the program is not code-signed yet).
   - **Mac / Linux:** in Terminal:

     ```sh
     cd ~/Downloads
     chmod +x vacdeck-pair-darwin-arm64
     ./vacdeck-pair-darwin-arm64 K7QM4-XZP2A
     ```

4. Type the 2.4 GHz Wi-Fi the robot should use and its password.
5. When asked, put the robot in pairing mode: hold the **Home/Dock** button about 3 seconds (on
   some models **Clean + Dock** together) until the robot says it is ready.
6. The program joins the robot's Wi-Fi by itself. If it cannot, connect the computer by hand to the
   Wi-Fi whose name starts with `dreame-`, `mova-` or `trouver-` (no password) — the program
   continues on its own.
7. The robot rejoins your Wi-Fi, the computer reconnects, and the robot appears in VacDeck.

Your maps stay on the robot. Pairing again with the same VacDeck account keeps the robot's history.

## Privacy

- Your Wi-Fi password is typed into this program and sent **only to the robot**, over the
  robot's own hotspot, encrypted with a one-time key. VacDeck never receives it.
- VacDeck receives only the robot's id, so it can add the robot to your account.
- The log (`vacdeck-pair.log` in your home folder) never contains the password.

## Problems

[Open an issue](https://github.com/leduyphuc1702/vacdeck-pair/issues/new/choose) and attach
`vacdeck-pair.log`. Never post your Wi-Fi password or the pairing code.

| Message | Try |
|---|---|
| Code unknown or expired | Make a new code on the VacDeck page (codes last one hour). |
| Robot's hotspot never appeared | Hold the Dock button longer; the robot must say it is ready to pair. Keep the computer near the robot. |
| Could not join the robot's hotspot | Join it by hand from the Wi-Fi menu; the program continues. |
| Robot refused the Wi-Fi settings | Check the Wi-Fi name and password; the robot only supports 2.4 GHz. |
| Robot paired but VacDeck does not show it | Wait a minute, then press **Sync** in VacDeck. |

## Let an AI agent do it

On the VacDeck page choose **Add a robot → Ask an AI agent**, copy the prompt, and paste it into an
AI agent that can run commands on your computer (Claude Code, Codex, Cursor, Gemini CLI…). The
agent asks you everything first, then runs the program once; you only press the robot's button.
How the agent should drive the program: [AGENTS.md](AGENTS.md).

## Options

```
vacdeck-pair [CODE] [--ssid NAME] [--saved-password] [--manual] [--json] [--max-minutes N]
             [--lang en|vi|ru] [--log FILE]
```

- `--ssid` — Wi-Fi for the robot (otherwise asked; Enter keeps the current network).
- `--saved-password` — use the password this computer saved for that Wi-Fi (your system may ask
  you to allow it). The password can also come from the `VACDECK_WIFI_PASSWORD` environment variable.
- `--manual` — do not switch Wi-Fi automatically; you join the robot's hotspot yourself.
- `--json` — for AI agents and scripts: never waits for the keyboard, prints one JSON line per step,
  the last line is the result (see [AGENTS.md](AGENTS.md)).
- `--max-minutes N` — stop after N minutes. If the robot already paired, running the same command
  again continues where it stopped.

Exit codes: 0 done · 1 pairing failed · 2 not a code · 3 code unknown/used or VacDeck unreachable ·
4 paired but not added · 5 Wi-Fi name or password needed · 6 paired, run again to finish.

## Develop

```sh
npm test                            # protocol + whole run against a stand-in robot
node test/fake-robot.mjs 44322 &    # stand-in robot on 127.0.0.1
node src/cli.mjs CODE --robot-host 127.0.0.1 --robot-port 44322 --api http://localhost:3100
sh scripts/build.sh                 # single-file programs in dist/ (needs Bun)
```

Release: bump `VERSION` in `src/main.mjs`, `npm test`, `sh scripts/build.sh`, then
`gh release create vX.Y.Z dist/*`. (A GitHub Actions version of this is in `ci/release.yml`.)

---

## Tiếng Việt

Công cụ thêm robot Dreame/MOVA/Trouver **không có camera** (không quét được mã QR) vào VacDeck.
Chạy trên máy tính có WiFi, đặt gần robot.

1. Trên VacDeck chọn **Thêm robot → Ghép bằng máy tính**, chép mã ghép (dạng `K7QM4-XZP2A`,
   dùng trong 1 giờ).
2. Tải chương trình ở [bản phát hành mới nhất](https://github.com/leduyphuc1702/vacdeck-pair/releases/latest)
   (Windows: `vacdeck-pair-windows-x64.exe`; Mac chip Apple: `vacdeck-pair-darwin-arm64`).
3. Chạy và dán mã. Windows báo "Windows protected your PC" thì bấm **More info → Run anyway**.
4. Nhập tên WiFi 2.4 GHz cho robot và mật khẩu.
5. Khi được nhắc, giữ nút **Home/Sạc** khoảng 3 giây (vài máy: **Dọn + Sạc**) đến khi robot báo
   sẵn sàng kết nối.
6. Chương trình tự nối vào WiFi của robot; nếu không được, hãy tự nối máy vào WiFi tên bắt đầu
   bằng `dreame-`, `mova-` hoặc `trouver-` (không mật khẩu).
7. Robot vào lại WiFi nhà và hiện trong VacDeck.

**Nhờ AI agent làm giúp:** trên VacDeck chọn **Thêm robot → Nhờ AI agent**, sao chép prompt và dán
vào AI agent chạy được lệnh trên máy tính (Claude Code, Codex, Cursor, Gemini CLI…). Agent hỏi bạn
mọi thứ trước rồi tự chạy chương trình; bạn chỉ cần giữ nút trên robot. Chi tiết: [AGENTS.md](AGENTS.md).

Mật khẩu WiFi chỉ gửi tới robot (mã hoá), VacDeck không nhận. Gặp lỗi:
[gửi báo lỗi](https://github.com/leduyphuc1702/vacdeck-pair/issues/new/choose) kèm tệp
`vacdeck-pair.log` trong thư mục người dùng — không dán mật khẩu WiFi hay mã ghép.

## Русский

Утилита добавляет робот-пылесос Dreame/MOVA/Trouver **без камеры** (не может сканировать QR) в
VacDeck. Запускайте на компьютере с Wi-Fi рядом с роботом.

1. В VacDeck выберите **Добавить робота → Подключить через компьютер** и скопируйте код
   (вида `K7QM4-XZP2A`, действует 1 час).
2. Скачайте программу из [последнего релиза](https://github.com/leduyphuc1702/vacdeck-pair/releases/latest).
3. Запустите и вставьте код. Если Windows пишет «Windows protected your PC», нажмите
   **Подробнее → Выполнить в любом случае**.
4. Введите имя сети Wi-Fi 2,4 ГГц для робота и пароль.
5. По подсказке удерживайте кнопку **Домой/База** около 3 секунд (на некоторых моделях
   **Уборка + База**), пока робот не сообщит о готовности.
6. Программа сама подключится к Wi-Fi робота; если нет — подключитесь вручную к сети,
   имя которой начинается с `dreame-`, `mova-` или `trouver-` (без пароля).
7. Робот вернётся в домашнюю сеть и появится в VacDeck.

**Через ИИ-агента:** в VacDeck выберите **Добавить робота → Попросить ИИ-агента**, скопируйте промпт
и вставьте его в агента, который умеет запускать команды на компьютере (Claude Code, Codex, Cursor,
Gemini CLI…). Агент сначала всё спросит, затем сам запустит программу. Подробно: [AGENTS.md](AGENTS.md).

Пароль Wi-Fi передаётся только роботу (в зашифрованном виде), VacDeck его не получает. Проблемы:
[создайте обращение](https://github.com/leduyphuc1702/vacdeck-pair/issues/new/choose) и приложите
`vacdeck-pair.log` — не публикуйте пароль Wi-Fi и код подключения.

## License

MIT
