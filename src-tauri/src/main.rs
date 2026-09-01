#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{io, thread};

use rdev::listen;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    utils::config::BackgroundThrottlingPolicy,
    Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent,
};

mod global_alt;
use global_alt::{GlobalAltState, VoiceKeyEvent};

const DEFAULT_SERVER_URL: &str = "http://127.0.0.1:5173";
const DESKTOP_INIT_SCRIPT: &str = r#"
  window.__GIT_MASTER_DESKTOP__ = true;
  if (navigator.locks?.request) {
    navigator.locks.request('git-master-background-voice', () => new Promise(() => {}));
  }
"#;

fn dispatch_voice_event(app: &tauri::AppHandle, name: &str) {
    if let Some(window) = app.get_webview_window("main") {
        let script = format!(
            "window.dispatchEvent(new CustomEvent({name:?}, {{ detail: {{ at: Date.now() }} }}));"
        );
        let _ = window.eval(script);
    }
}

fn start_global_alt_listener(app: tauri::AppHandle) {
    thread::spawn(move || {
        let mut state = GlobalAltState::default();
        let listener = move |event: rdev::Event| {
            let event_name = match state.handle(event.event_type) {
                Some(VoiceKeyEvent::Pressed) => "git-master:voice-pressed",
                Some(VoiceKeyEvent::Released) => "git-master:voice-released",
                Some(VoiceKeyEvent::Cancelled) => "git-master:voice-cancelled",
                None => return,
            };
            dispatch_voice_event(&app, event_name);
        };

        if let Err(error) = listen(listener) {
            eprintln!("Git Master could not start the global Alt listener: {error:?}");
        }
    });
}

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let server_url = std::env::var("GIT_MASTER_URL")
                .unwrap_or_else(|_| DEFAULT_SERVER_URL.to_string())
                .parse()
                .map_err(|error| {
                    io::Error::new(
                        io::ErrorKind::InvalidInput,
                        format!("Invalid GIT_MASTER_URL: {error}"),
                    )
                })?;

            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(server_url))
                .title("Git Master")
                .inner_size(1440.0, 900.0)
                .min_inner_size(920.0, 640.0)
                .background_throttling(BackgroundThrottlingPolicy::Disabled)
                .initialization_script(DESKTOP_INIT_SCRIPT)
                .build()?;

            let open = MenuItem::with_id(app, "open", "Open Git Master", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&open, &quit])?;
            let mut tray = TrayIconBuilder::new()
                .tooltip("Git Master — hold left Alt to talk")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => show_main_window(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main_window(tray.app_handle());
                    }
                });
            if let Some(icon) = app.default_window_icon() {
                tray = tray.icon(icon.clone());
            }
            tray.build(app)?;

            start_global_alt_listener(app.handle().clone());
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running the Git Master desktop companion");
}
