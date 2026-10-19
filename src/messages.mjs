// Every line the tool prints, in English, Vietnamese and Russian. `{x}` is filled at print time.

const en = {
  title: "VacDeck robot pairing",
  ask_code: "Pairing code shown in VacDeck (e.g. K7QM4-XZP2A): ",
  bad_code: "That does not look like a pairing code. Copy it from the VacDeck page.",
  fetching: "Checking the code…",
  code_unknown: "This code is unknown or expired. Make a new one on the VacDeck page.",
  code_used: "This code already added a robot. Make a new one to add another robot.",
  offline: "Cannot reach VacDeck. Check this computer's internet connection and try again.",
  ask_ssid: "Wi-Fi the robot should join (2.4 GHz){hint}: ",
  ask_ssid_hint: " [Enter = {ssid}]",
  ask_pass: "Password of “{ssid}” (stays on this computer): ",
  five_ghz: "Note: the robot only joins 2.4 GHz Wi-Fi. If “{ssid}” is 5 GHz only, use your 2.4 GHz network.",
  step_mode:
    "Now put the robot in pairing mode: press and hold the Home/Dock button for about 3 seconds " +
    "(on some models: Clean + Dock together) until the robot says it is ready to pair.",
  searching: "Looking for the robot's Wi-Fi hotspot… (up to {min} minutes)",
  found: "Found the robot's hotspot “{ssid}”. Joining it…",
  join_manual:
    "Connect this computer to the robot's Wi-Fi now (its name starts with “dreame-”, “mova-” or " +
    "“trouver-”, no password). The tool continues by itself once connected.",
  joined: "Connected to the robot. Sending your Wi-Fi settings…",
  not_joined: "This computer did not join the robot's hotspot.",
  paired: "The robot accepted the settings and is joining “{ssid}”.",
  rejoining: "Reconnecting this computer to “{ssid}”…",
  rejoin_manual: "Reconnect this computer to your usual Wi-Fi now; the tool waits for the internet.",
  reporting: "Adding the robot to your VacDeck account… (the robot can take a minute to come online)",
  done: "Done! “{name}” is now in VacDeck. Go back to the VacDeck page.",
  done_unnamed: "Done! The robot is now in VacDeck. Go back to the VacDeck page.",
  report_slow:
    "VacDeck cannot see the robot yet. Make sure the robot's light shows it is online, then wait.",
  report_failed:
    "The robot paired, but VacDeck could not add it yet. Open the VacDeck page and press “Sync”, " +
    "or run this tool again with a new code.",
  failed: "Pairing did not finish: {reason}",
  reason_hotspot_not_found:
    "the robot's hotspot never appeared. Hold the Dock button a little longer and run the tool again.",
  reason_hotspot_join_failed: "this computer could not join the robot's hotspot.",
  reason_no_response:
    "the robot did not answer. Keep the computer within a few meters of the robot and try again.",
  reason_pincode_required: "this robot asks for a PIN, which the tool does not support yet.",
  reason_router_rejected: "the robot refused the Wi-Fi settings. Check the name and password.",
  reason_other: "an unexpected error.",
  help: "Need help? Open an issue and attach the log: {url}",
  log_saved: "Log saved to {path} (no passwords in it).",
  press_enter: "Press Enter to close.",
};

const vi = {
  title: "VacDeck — ghép robot",
  ask_code: "Mã ghép hiện trên VacDeck (vd. K7QM4-XZP2A): ",
  bad_code: "Đây không phải mã ghép. Hãy chép mã từ trang VacDeck.",
  fetching: "Đang kiểm tra mã…",
  code_unknown: "Mã không đúng hoặc đã hết hạn. Hãy tạo mã mới trên trang VacDeck.",
  code_used: "Mã này đã thêm một robot. Tạo mã mới để thêm robot khác.",
  offline: "Không kết nối được VacDeck. Kiểm tra internet của máy tính rồi thử lại.",
  ask_ssid: "WiFi cho robot (2.4 GHz){hint}: ",
  ask_ssid_hint: " [Enter = {ssid}]",
  ask_pass: "Mật khẩu “{ssid}” (chỉ ở trên máy này): ",
  five_ghz: "Lưu ý: robot chỉ vào được WiFi 2.4 GHz. Nếu “{ssid}” chỉ có 5 GHz, hãy chọn mạng 2.4 GHz.",
  step_mode:
    "Giờ cho robot vào chế độ ghép: giữ nút Home/Sạc khoảng 3 giây (một số máy: giữ Dọn + Sạc " +
    "cùng lúc) đến khi robot báo sẵn sàng kết nối.",
  searching: "Đang tìm WiFi phát từ robot… (tối đa {min} phút)",
  found: "Đã thấy WiFi của robot “{ssid}”. Đang kết nối…",
  join_manual:
    "Hãy nối máy tính vào WiFi của robot ngay (tên bắt đầu bằng “dreame-”, “mova-” hoặc " +
    "“trouver-”, không mật khẩu). Nối xong công cụ tự chạy tiếp.",
  joined: "Đã nối với robot. Đang gửi thông tin WiFi…",
  not_joined: "Máy tính chưa nối được vào WiFi của robot.",
  paired: "Robot đã nhận thông tin và đang vào mạng “{ssid}”.",
  rejoining: "Đang nối lại máy tính vào “{ssid}”…",
  rejoin_manual: "Hãy nối lại máy tính vào WiFi nhà; công cụ sẽ chờ có internet.",
  reporting: "Đang thêm robot vào tài khoản VacDeck… (robot có thể mất khoảng 1 phút để online)",
  done: "Xong! “{name}” đã có trong VacDeck. Quay lại trang VacDeck.",
  done_unnamed: "Xong! Robot đã có trong VacDeck. Quay lại trang VacDeck.",
  report_slow: "VacDeck chưa thấy robot. Kiểm tra đèn robot báo đã online rồi chờ thêm.",
  report_failed:
    "Robot đã ghép nhưng VacDeck chưa thêm được. Mở trang VacDeck và bấm “Đồng bộ”, " +
    "hoặc chạy lại công cụ với mã mới.",
  failed: "Chưa ghép xong: {reason}",
  reason_hotspot_not_found: "không thấy WiFi của robot. Giữ nút Sạc lâu hơn một chút rồi chạy lại.",
  reason_hotspot_join_failed: "máy tính không nối được vào WiFi của robot.",
  reason_no_response: "robot không trả lời. Để máy tính gần robot (vài mét) rồi thử lại.",
  reason_pincode_required: "robot này yêu cầu mã PIN, công cụ chưa hỗ trợ.",
  reason_router_rejected: "robot từ chối thông tin WiFi. Kiểm tra lại tên và mật khẩu.",
  reason_other: "lỗi không mong đợi.",
  help: "Cần trợ giúp? Gửi báo lỗi kèm tệp log tại: {url}",
  log_saved: "Đã lưu log ở {path} (không chứa mật khẩu).",
  press_enter: "Nhấn Enter để đóng.",
};

const ru = {
  title: "VacDeck — подключение робота",
  ask_code: "Код подключения из VacDeck (напр. K7QM4-XZP2A): ",
  bad_code: "Это не похоже на код подключения. Скопируйте его со страницы VacDeck.",
  fetching: "Проверяем код…",
  code_unknown: "Код неверный или устарел. Создайте новый на странице VacDeck.",
  code_used: "Этот код уже добавил робота. Создайте новый, чтобы добавить другого.",
  offline: "Нет связи с VacDeck. Проверьте интернет на компьютере и попробуйте снова.",
  ask_ssid: "Wi-Fi для робота (2,4 ГГц){hint}: ",
  ask_ssid_hint: " [Enter = {ssid}]",
  ask_pass: "Пароль «{ssid}» (остаётся на этом компьютере): ",
  five_ghz: "Робот подключается только к 2,4 ГГц. Если «{ssid}» работает только на 5 ГГц, выберите сеть 2,4 ГГц.",
  step_mode:
    "Переведите робота в режим подключения: удерживайте кнопку «Домой/База» около 3 секунд " +
    "(на некоторых моделях: «Уборка» + «База» вместе), пока робот не сообщит о готовности.",
  searching: "Ищем точку доступа робота… (до {min} мин)",
  found: "Нашли точку доступа робота «{ssid}». Подключаемся…",
  join_manual:
    "Подключите компьютер к Wi-Fi робота (имя начинается с «dreame-», «mova-» или «trouver-», " +
    "без пароля). После подключения утилита продолжит сама.",
  joined: "Подключились к роботу. Отправляем настройки Wi-Fi…",
  not_joined: "Компьютер не подключился к точке доступа робота.",
  paired: "Робот принял настройки и подключается к «{ssid}».",
  rejoining: "Возвращаем компьютер в «{ssid}»…",
  rejoin_manual: "Подключите компьютер обратно к домашнему Wi-Fi; утилита ждёт интернет.",
  reporting: "Добавляем робота в аккаунт VacDeck… (роботу может понадобиться минута)",
  done: "Готово! «{name}» добавлен в VacDeck. Вернитесь на страницу VacDeck.",
  done_unnamed: "Готово! Робот добавлен в VacDeck. Вернитесь на страницу VacDeck.",
  report_slow: "VacDeck пока не видит робота. Убедитесь, что индикатор показывает подключение, и подождите.",
  report_failed:
    "Робот подключён, но VacDeck пока не смог его добавить. Откройте VacDeck и нажмите " +
    "«Синхронизировать» или запустите утилиту снова с новым кодом.",
  failed: "Подключение не завершено: {reason}",
  reason_hotspot_not_found:
    "точка доступа робота не появилась. Удерживайте кнопку «База» чуть дольше и запустите снова.",
  reason_hotspot_join_failed: "компьютер не смог подключиться к точке доступа робота.",
  reason_no_response: "робот не ответил. Держите компьютер в паре метров от робота и попробуйте снова.",
  reason_pincode_required: "робот запрашивает PIN-код, утилита пока это не поддерживает.",
  reason_router_rejected: "робот отклонил настройки Wi-Fi. Проверьте имя и пароль.",
  reason_other: "непредвиденная ошибка.",
  help: "Нужна помощь? Создайте обращение и приложите журнал: {url}",
  log_saved: "Журнал сохранён: {path} (паролей в нём нет).",
  press_enter: "Нажмите Enter, чтобы закрыть.",
};

const tables = { en, vi, ru };

export function pickLanguage(env = process.env) {
  const tag = (
    env.VACDECK_LANG ||
    env.LC_ALL ||
    env.LC_MESSAGES ||
    env.LANG ||
    Intl.DateTimeFormat().resolvedOptions().locale ||
    "en"
  ).toLowerCase();
  if (tag.startsWith("vi")) return "vi";
  if (tag.startsWith("ru")) return "ru";
  return "en";
}

export function translator(language) {
  const table = tables[language] ?? en;
  return (key, params = {}) =>
    (table[key] ?? en[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => String(params[name] ?? ""));
}

export const languages = Object.keys(tables);
export const messageKeys = Object.keys(en);
export { tables };
