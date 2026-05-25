<p align="center">
  <img src="static/img/spotify.png" width="128" height="128" alt="Spotify">
</p>
<h1 align="center">Spotify для StreamDock</h1>
<p align="center">
  <b>Управляйте десктопным Spotify прямо с StreamDock</b><br>
  <sub>Play/Pause · Next/Prev · Volume · Mute · Like · Track Info · Progress</sub>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.0.3-1DB954?style=flat-square&labelColor=191414" alt="Version">
  <img src="https://img.shields.io/badge/StreamDock-2.10%2B-1DB954?style=flat-square&labelColor=191414" alt="StreamDock">
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS-1DB954?style=flat-square&labelColor=191414" alt="Platform">
</p>


## 📋 Описание

Плагин для **локального** управления Spotify через Chrome DevTools Protocol (CDP).  
Работает напрямую с десктопным приложением Spotify — не требует API-ключей, токенов и интернета после загрузки страницы.

> **Принцип работы:** плагин подключается к Spotify через удалённую отладку Chromium (CDP), инжектирует скрипт в интерфейс Spotify и управляет плеером через DOM-события.

---

## ✨ Возможности

| Действие | StreamDock | Описание |
|----------|-----------|----------|
| ▶️ **Play/Pause** | Кнопка | Воспроизведение / Пауза |
| ⏭️ **Next Track** | Кнопка | Следующий трек |
| ⏮️ **Previous Track** | Кнопка | Предыдущий трек |
| ℹ️ **Track Info** | Кнопка / Info | Название, исполнитель, обложка |
| ❤️ **Like** | Кнопка | Добавить / убрать из библиотеки |
| 🔊 **Volume Up** | Кнопка / Энкодер | Громкость +5% |
| 🔉 **Volume Down** | Кнопка / Энкодер | Громкость -5% |
| 🎚️ **Volume (Encoder)** | Энкодер + нажатие | Вращение — громкость, нажатие — Mute |
| 🔇 **Mute** | Кнопка | Вкл / Выкл звук |
| 📊 **Progress** | Кнопка / Info | Полоса прогресса текущего трека |

---

## 🚀 Установка

### 1. Скачайте плагин

Скачайте или скопируйте папку `com.Vallhant.spotify` в директорию плагинов StreamDock:
%APPDATA%\HotSpot\StreamDock\plugins\ (Windows) ~/Library/Application Support/StreamDock/plugins/ (macOS)


### 2. Установите зависимости

```bash
cd com.Vallhant.spotify
npm install
3. Запустите Spotify с отладкой
Spotify нужно запускать с флагом --remote-debugging-port=9223:

Автоматически: в настройках кнопки плагина нажмите «Запустить Spotify»

Вручную:

bash
# Windows (cmd)
%APPDATA%\Spotify\Spotify.exe --remote-debugging-port=9223

# macOS
open -a Spotify --args --remote-debugging-port=9223
⚠️ Spotify нужно полностью закрыть (включая иконку в трее) перед запуском с флагом.

⚙️ Настройка
Добавьте кнопку плагина Spotify на панель StreamDock
В открывшейся панели настроек укажите порт (по умолчанию 9223)
Убедитесь, что Spotify запущен с флагом отладки
Статус подключения отображается в панели свойств
Порт можно изменить, если порт 9223 занят:

bash
%APPDATA%\Spotify\Spotify.exe --remote-debugging-port=9224
🛠 Технические детали
Как это работает
┌──────────────┐     CDP WebSocket      ┌──────────────┐
│  StreamDock   │ ◄────────────────────► │   Spotify    │
│  (Node.js)    │    ws://127.0.0.1      │  (Chrome)    │
│              │        :9223            │              │
│  cdp-control- │                        │  Инжекти-    │
│  ler.js ◄───►│◄── Runtime.binding ───►│  рованный    │
│  plugin-core  │    sdNotify (JSON)     │  скрипт     │
└──────────────┘                        └──────────────┘
Плагин подключается к Spotify через CDP WebSocket
Инжектирует injected_api.js — скрипт-контроллер в интерфейс Spotify
Скрипт каждые 150 мс опрашивает DOM Spotify (название, прогресс, громкость, лайк)
Изменения отправляются в плагин через Runtime.bindingCalled
Плагин обновляет иконки и заголовки на StreamDock
Основные файлы
Файл	Назначение
plugin/index.js	Точка входа, обработчики действий StreamDock
plugin/lib/plugin-core.js	WebSocket-соединение со StreamDock, базовые Actions
plugin/lib/cdp-controller.js	Подключение к Spotify через CDP, управление громкостью
plugin/scripts/injected_api.js	Инжектируемый скрипт для DOM-управления Spotify
plugin/lib/progress-image.js	Генерация PNG полосы прогресса (на лету)
plugin/lib/image-cache.js	Кэширование обложек треков
scripts/generate-icons.js	Генератор PNG-иконок (144×144, RGBA)
Управление громкостью
Громкость регулируется через wheel-события на полосе громкости Spotify — это надёжнее, чем клик по координатам.
Энкодер имеет debounce 80 мс и шаг 2% для плавного управления без дребезга.

❗ Возможные проблемы
Проблема	Решение
«Нет связи» на кнопке	Spotify не запущен с флагом --remote-debugging-port
Плагин не подключается	Проверьте порт в настройках (по умолч. 9223)
Не работают кнопки	Перезапустите Spotify с флагом отладки
Не отображается обложка	Проверьте соединение — обложки загружаются со Spotify CDN
Spotify из Microsoft Store	Установите версию с spotify.com
🔧 Для разработчиков
bash
# Перегенерация иконок
node scripts/generate-icons.js

# Тестирование CDP-подключения
node scripts/test-cdp.js

# Просмотр DOM-структуры Spotify
node scripts/probe-dom.js
Логирование
Логи пишутся в папку log/ рядом с плагином.
Уровни: INFO, ERROR. Даты в имени файла: YYYY-MM-DD.log.
