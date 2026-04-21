use tauri::{
    CustomMenuItem, SystemTray, SystemTrayMenu, SystemTrayMenuItem, SystemTrayEvent
};
use tauri_plugin_notification::NotificationExt;
use keyring::Entry;

// ✅ Fix #5.2: Enhanced Windows Security & UX
pub fn setup_tray() -> SystemTray {
    let quit = CustomMenuItem::new("quit".to_string(), "Выход");
    let hide = CustomMenuItem::new("hide".to_string(), "Свернуть");
    let show = CustomMenuItem::new("show".to_string(), "Открыть SecureNet");
    
    let tray_menu = SystemTrayMenu::new()
        .add_item(show)
        .add_native_item(SystemTrayMenuItem::Separator)
        .add_item(hide)
        .add_item(quit);

    SystemTray::new().with_menu(tray_menu)
}

#[tauri::command]
pub fn send_notification(app: tauri::AppHandle, title: &str, body: &str) {
    app.notification()
        .builder()
        .title(title)
        .body(body)
        .show()
        .unwrap();
}

// ✅ Windows-specific secure key storage (POC implementation)
#[tauri::command]
pub fn secure_save_key(key_name: String, key_value: String) -> Result<(), String> {
    let entry = Entry::new("SecureNet", &key_name).map_err(|e| e.to_string())?;
    entry.set_password(&key_value).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn secure_get_key(key_name: String) -> Result<String, String> {
    let entry = Entry::new("SecureNet", &key_name).map_err(|e| e.to_string())?;
    entry.get_password().map_err(|e| e.to_string())
}

// ✅ Windows-specific secure key decryption (Placeholder for DPAPI)
#[tauri::command]
pub fn decrypt_local_store(encrypted_blob: Vec<u8>) -> Result<String, String> {
    let _ = encrypted_blob;
    Err("decrypt_local_store is deprecated; use secure_get_key() backed by OS keychain".to_string())
}
