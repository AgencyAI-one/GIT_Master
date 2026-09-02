# Git Master Companion для macOS

[English version](README.md)

Git Master Companion — нативний macOS-клієнт для вебзастосунку Git Master. Він написаний на Swift, SwiftUI, AppKit і WebKit та додає системні гарячі клавіші, індикацію в menu bar і запуск разом із входом у систему, поки фокус має Xcode, Terminal, браузер або інша програма.

Це звичайний macOS-застосунок, який збирається у Xcode, а не розширення Xcode. Він корисний під час роботи в Xcode, але не інжектить код у Xcode і не керує ним.

Увесь source-код самодостатньо розміщений у цій директорії, не має сторонніх Swift-залежностей і поширюється за [MIT-ліцензією](../LICENSE) репозиторію.

## Можливості companion

- Глобальні налаштовувані shortcuts для push-to-talk і створення задачі.
- Надійний стандартний Right Option, який не займає shortcuts із Left Option.
- Утримування для запису та подвійне натискання для фіксації запису.
- Live-стан мікрофона і створення задачі в menu bar macOS.
- Постійний `WKWebView` із наявною інсталяцією Git Master.
- Налаштовуваний URL сервера й опціональний запуск при вході в macOS.
- Діагностика Accessibility та Input Monitoring у Settings.
- Unit-тести, shared Xcode scheme, локальний DMG builder та опціональний Developer ID/notarization workflow.

Companion не містить сервер Git Master. Авторизація, доступ до GitHub, виклики AI-провайдера, дані задач і завантаження файлів залишаються у налаштованій вебінсталяції.

## Вимоги

- Mac із macOS 13 Ventura або новішою.
- Повний Xcode 15 або новіший. Самих Command Line Tools недостатньо для Xcode-проєкту й test target.
- Запущений сервер Git Master.
- HTTPS для віддаленого сервера. Звичайний HTTP приймається лише для development через `localhost`, `127.0.0.1` або `::1`.

Для складання самого нативного companion не потрібні Homebrew, Rust, Node.js або сторонні Swift packages.

## Швидкий запуск із source-коду

Запусти Git Master на тому самому Mac із кореня репозиторію:

```bash
npm install
cp .env.example .env.local
./start.sh dev 5173
```

Потім відкрий друге вікно Terminal:

```bash
cd mac_xcode_app_shortcut
./scripts/doctor.sh
open GitMasterCompanion.xcodeproj
```

У Xcode:

1. Вибери схему **GitMasterCompanion** і destination **My Mac**.
2. Якщо Xcode просить налаштувати signing, відкрий **Signing & Capabilities** app target і вибери Personal Team або **Sign to Run Locally**.
3. Натисни **Run** (`Command-R`).
4. Відкрий **Git Master → Settings** і перевір URL сервера `http://127.0.0.1:5173`.
5. Надай описані нижче дозволи, повністю закрий companion і запусти його знову.

Адреса localhost завжди означає Mac, на якому запущений companion. Якщо Git Master працює на іншій машині, вкажи її HTTPS URL або створи локальний tunnel:

```bash
ssh -L 5173:127.0.0.1:5173 user@your-development-server
```

## Як користуватися

Стандартні shortcuts:

| Дія | Стандартна клавіша | Поведінка |
| --- | --- | --- |
| Голосовий ввід | Right Option | Утримуй під час мовлення і відпусти для відправлення. Подвійне натискання залишає запис активним до наступного натискання. |
| Нова задача | Command-Shift-N | Відкриває Git Master і починає нову задачу в поточному вибраному репозиторії. |

Right Option — рекомендоване стандартне значення, бо він не конфліктує з комбінаціями Left Option, які часто використовуються для символів і команд програм. Можливість зміни залишається для AltGr layouts, зовнішніх клавіатур та конфліктів з іншими глобальними утилітами.

Щоб змінити shortcut, відкрий **Git Master → Settings → Global shortcuts**, натисни його поле і введи комбінацію або натисни й відпусти окрему клавішу-модифікатор. `Esc` скасовує запис. Voice input і New Issue не можуть мати однаковий binding. **Reset Shortcuts** повертає Right Option і Command-Shift-N.

Вебзастосунок визначає дію голосової команди з поточного контексту. Перед використанням New Issue вибери потрібні GitHub connection, repository та Project.

Закриття головного вікна не завершує companion. Відкрий його з menu bar або вибери **Quit Git Master**, щоб зупинити всі глобальні listeners.

### Стан у menu bar

| Іконка | Значення |
| --- | --- |
| `mic` | Глобальна голосова клавіша готова. |
| `mic.fill` | Голосовий ввід зараз активний. |
| `mic.slash` | Listener або необхідний Accessibility недоступний. |
| `plus.square.fill` | Щойно спрацювала команда New Issue. |

Menu також показує налаштовані shortcuts, дозволи, останнє джерело input і стан listener. Це найшвидший спосіб перевірити, чи отримав нативний app клавішу, коли фокус був в іншій програмі.

## Дозволи macOS

macOS надає privacy-дозволи конкретній встановленій і підписаній ідентичності застосунку. Перед наданням доступу встанови або залиш app за стабільним шляхом; зміна Bundle ID, підпису чи build location може створити новий запис.

| Дозвіл | Для чого використовується | Чи обов'язковий |
| --- | --- | --- |
| Accessibility | Вмикає основний пасивний AppKit global event monitor, коли фокус має інша програма. | Обов'язковий для підтримуваного надійного шляху глобальних shortcuts. |
| Input Monitoring | Вмикає резервний listen-only Core Graphics event tap і діагностику. | Рекомендований fallback; у поточному UI не замінює Accessibility. |
| Microphone | Дозволяє довіреній сторінці Git Master записувати голос у вбудованому WebView. | Потрібен лише для голосового вводу. |

Надавай дозволи в такому порядку:

1. При встановленні з DMG перемісти **Git Master.app** до `/Applications`.
2. Відкрий **Git Master → Settings → macOS permissions**.
3. Натисни **Request Permission** або **Open Settings** біля Accessibility і ввімкни **Git Master** у **System Settings → Privacy & Security → Accessibility**.
4. Увімкни той самий `/Applications/Git Master.app` у **Privacy & Security → Input Monitoring**.
5. Закрий Git Master через menu bar і відкрий його знову.
6. Один раз запусти голосовий ввід і підтвердь системний запит Microphone. Пізніше дозвіл доступний у **Privacy & Security → Microphone**.
7. Перевір у menu bar статуси **Accessibility granted** і **Global shortcuts active**. Перейди в іншу програму та натисни Right Option — іконка мікрофона має одразу заповнитися.

Apple описує системні налаштування [Accessibility](https://support.apple.com/guide/mac-help/allow-accessibility-apps-to-access-your-mac-mh43185/mac) та [Input Monitoring](https://support.apple.com/guide/mac-help/control-access-to-input-monitoring-on-mac-mchl4cedafb6/mac) у Mac User Guide.

Listener отримує key codes, стан модифікаторів і події кнопок миші, необхідні, щоб відрізнити налаштований shortcut від комбінацій на кшталт Option-Tab. Він ніколи не поглинає і не переписує ці події, не зберігає й не передає набраний текст. Для діагностики menu тримає в пам'яті лише опис останнього key code/modifiers і джерело дії до завершення процесу.

## Тести й перевірка проєкту

Запусти діагностику Xcode-проєкту:

```bash
./scripts/doctor.sh
```

Запусти всі native unit-тести з локальним ad-hoc signing:

```bash
./scripts/test.sh
```

Ті самі тести доступні у Xcode через `Command-U`. Shared scheme і source-only project files входять до Git, а `xcuserdata`, DerivedData, test results, apps, archives і DMG ігноруються.

## Локальна збірка DMG

Для app, який використовуватиметься на тому самому Mac, членство в Apple Developer Program не потрібне:

```bash
./scripts/build-dmg.sh
```

Скрипт виконує clean Release build, застосовує ad-hoc signature, перевіряє app і disk image та створює:

```text
build/Git-Master-1.0.0.dmg
```

Відкрий DMG, перетягни **Git Master.app** до **Applications**, витягни DMG і запусти `/Applications/Git Master.app`. Не запускай і не надавай дозволи копії всередині змонтованого DMG.

Параметри build передаються через environment variables:

| Змінна | Стандартне значення | Призначення |
| --- | --- | --- |
| `VERSION` | `1.0.0` | Marketing version app і назва DMG; від одного до трьох числових компонентів. |
| `BUILD_NUMBER` | `1` | Числовий bundle build number. |
| `BUNDLE_IDENTIFIER` | `com.agencyai.gitmaster.companion` | Заміна ідентичності для fork. |
| `BUILD_DIR` | `build/` | Каталог DerivedData та артефактів. |
| `DEVELOPMENT_TEAM` | порожньо | Вмикає automatic signing через вибрану Apple team. |
| `CODE_SIGN_IDENTITY` | порожньо | Вмикає явний signing, зазвичай Developer ID Application identity. |
| `NOTARY_PROFILE` | порожньо | Надсилає DMG, очікує результат і прикріплює notarization ticket через Keychain profile. |

Приклад локального build із власними metadata:

```bash
VERSION=1.1.0 BUILD_NUMBER=12 \
BUNDLE_IDENTIFIER=org.example.gitmaster.companion \
./scripts/build-dmg.sh
```

## Публічний підписаний і notarized реліз

Публічні binaries потрібно підписувати сертифікатом **Developer ID Application** і нотаризувати. Для цього потрібні Apple Developer Program membership і Bundle ID, контрольований автором релізу.

Один раз збережи credentials нотаризації в login Keychain maintainer. Ніколи не коміть credentials або `.p8` key:

```bash
xcrun notarytool store-credentials "git-master-notary" \
  --apple-id "APPLE_ID" \
  --team-id "TEAM_ID" \
  --password "APP_SPECIFIC_PASSWORD"
```

Збери, підпиши, нотаризуй і staple DMG:

```bash
VERSION=1.0.0 \
BUILD_NUMBER=1 \
BUNDLE_IDENTIFIER=com.example.gitmaster.companion \
DEVELOPMENT_TEAM=TEAM_ID \
CODE_SIGN_IDENTITY="Developer ID Application: Publisher Name (TEAM_ID)" \
NOTARY_PROFILE=git-master-notary \
./scripts/build-dmg.sh
```

Скрипт перевіряє app signature, підписує й перевіряє DMG, запускає `hdiutil verify`, надсилає DMG через `notarytool --wait`, а потім додає і перевіряє ticket. Apple документує цей процес у [Customizing the notarization workflow](https://developer.apple.com/documentation/security/customizing-the-notarization-workflow).

Не публікуй стандартний ad-hoc artifact як офіційний реліз. Він призначений лише для людини, яка сама зібрала його з перевіреного source-коду.

## Безпека і межі даних

- Налаштований URL сервера та bindings клавіш зберігаються в `UserDefaults`.
- Authentication cookies залишаються у постійному WebKit data store.
- GitHub tokens, issue data та ключі AI-провайдерів залишаються на сервері Git Master.
- URL сервера з user-info credentials відхиляються.
- Віддалений plain HTTP відхиляється; loopback HTTP доступний для local development.
- Microphone capture дозволяється лише налаштованому origin сервера.
- Cross-origin navigation відкривається у стандартному браузері, а не залишається у привілейованому WebView.
- Global input monitors пасивні й не можуть блокувати або змінювати системний input.
- App не має analytics і сторонніх SDK.

Підключай companion лише до сервера Git Master, якому довіряєш. Налаштована сторінка отримує авторизовану WebKit session і, після дозволу, звук із мікрофона.

Для повідомлень про вразливості використовуй [security policy](../SECURITY.md) репозиторію. Не додавай справжні tokens, приватний issue content або recordings у публічний issue.

## Структура проєкту

```text
GitMasterCompanion/             Swift source-код застосунку
GitMasterCompanionTests/        Unit-тести
GitMasterCompanion.xcodeproj/   Xcode-проєкт і shared scheme
scripts/doctor.sh               Діагностика Xcode-проєкту
scripts/test.sh                 Test runner з ad-hoc signing
scripts/build-dmg.sh            Локальний і notarized release builder
```

## Вирішення проблем

### Глобальна клавіша працює лише у вікні Git Master

Це означає, що локальний monitor працює, але macOS не передає глобальні events. Спочатку перевір **Accessibility**, потім **Input Monitoring**. Видали застарілі записи Git Master, додай точний `/Applications/Git Master.app`, закрий app через menu bar і відкрий знову. Menu має показувати **Accessibility granted** та **Global shortcuts active**.

Для перевірки використовуй Right Option. Left Option частіше бере участь у keyboard layout і shortcuts інших програм. Якщо **Last event** у menu змінюється, а **Last shortcut** — ні, reset bindings або запиши іншу комбінацію.

### Мікрофон запускається, але transcript не з'являється

Перевір Microphone permission, доступність сервера Git Master і налаштування його voice provider environment variables. Віддалений сервер має використовувати HTTPS.

### macOS каже, що app пошкоджений або від невідомого розробника

Офіційні downloadable builds мають використовувати Developer ID signing і notarization. Для unnotarized development build збери app самостійно з перевіреного source-коду. Не обходь Gatekeeper для binary, якому не довіряєш.

### Xcode закривається під час відкриття проєкту

Закрий Xcode і виконай:

```bash
./scripts/doctor.sh
```

Якщо діагностика успішна, перемісти лише per-user window state Xcode і знову відкрий shared project:

```bash
state_backup="$(mktemp -d "${TMPDIR:-/tmp}/git-master-xcode-state.XXXXXX")"
mv GitMasterCompanion.xcodeproj/xcuserdata "$state_backup/project-xcuserdata" 2>/dev/null || true
mv GitMasterCompanion.xcodeproj/project.xcworkspace/xcuserdata \
  "$state_backup/workspace-xcuserdata" 2>/dev/null || true
open GitMasterCompanion.xcodeproj
```

Додай до bug report повний output `doctor.sh`, версії macOS і Xcode та кроки відтворення.

### New Issue відкриває не той репозиторій

Native-команда використовує репозиторій, вибраний усередині Git Master. Спочатку відкрий головне вікно і вибери потрібні connection, repository та Project.

## Як долучитися

Перед pull request прочитай [contribution guide](../CONTRIBUTING.md). Зміни global input monitoring, permissions, WebKit origin checks, signing, launch at login або microphone behavior мають пояснювати вплив на security/privacy та містити відповідні тести.

Надсилаючи contribution, ти погоджуєшся, що він поширюється за [MIT-ліцензією](../LICENSE) репозиторію.
