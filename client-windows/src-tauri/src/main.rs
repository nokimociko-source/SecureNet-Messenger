mod desktop;

use tauri::Manager;
use crate::desktop::{setup_tray, send_notification, decrypt_local_store};

fn main() {
    tauri::Builder::default()
        .system_tray(setup_tray())
        .on_system_tray_event(|app, event| match event {
            tauri::SystemTrayEvent::MenuItemClick { id, .. } => {
                match id.as_str() {
                    "quit" => { std::process::exit(0); }
                    "show" => {
                        let window = app.get_window("main").unwrap();
                        window.show().unwrap();
                        window.set_focus().unwrap();
                    }
                    "hide" => {
                        let window = app.get_window("main").unwrap();
                        window.hide().unwrap();
                    }
                    _ => {}
                }
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            send_notification,
            decrypt_local_store,
            secure_save_key
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
