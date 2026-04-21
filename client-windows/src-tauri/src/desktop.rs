use tauri::{
    CustomMenuItem, SystemTray, SystemTrayMenu, SystemTrayMenuItem
};
use tauri::api::notification::Notification;
use keyring::Entry;

pub fn setup_tray() -> SystemTray {
    let quit = CustomMenuItem::new("quit".to_string(), "Выход");
    let hide = CustomMenuItem::new("hide".to_string(), "Свернуть");
    let show = CustomMenuItem::new("show".to_string(), "Открыть Catlover");
    
    let tray_menu = SystemTrayMenu::new()
        .add_item(show)
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(hide)
        .add_item(quit);

    SystemTray::new().with_menu(tray_menu)
}

#[tauri::command]
pub fn send_notification(app: tauri::AppHandle, title: &str, body: &str) {
    Notification::new(&app.config().tauri.bundle.identifier)
        .title(title)
        .body(body)
        .show()
        .unwrap();
}

#[tauri::command]
pub fn secure_save_key(key_name: String, key_value: String) -> Result<(), String> {
    let entry = Entry::new("Catlover", &key_name).map_err(|e| e.to_string())?;
    entry.set_password(&key_value).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn secure_get_key(key_name: String) -> Result<String, String> {
    let entry = Entry::new("Catlover", &key_name).map_err(|e| e.to_string())?;
    entry.get_password().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn decrypt_local_store(encrypted_blob: Vec<u8>) -> Result<String, String> {
    let _ = encrypted_blob;
    Err("decrypt_local_store is deprecated; use secure_get_key() backed by OS keychain".to_string())
}
