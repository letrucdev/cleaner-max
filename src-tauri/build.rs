fn main() {
    let mut attributes = tauri_build::Attributes::new();

    // tauri-build only embeds the app manifest (Common Controls v6) into the main binary, so
    // `cargo test` binaries fail with STATUS_ENTRYPOINT_NOT_FOUND. Embed the same manifest
    // through the linker instead, which applies to every target including tests.
    #[cfg(windows)]
    {
        attributes = attributes
            .windows_attributes(tauri_build::WindowsAttributes::new_without_app_manifest());
        let manifest = std::env::current_dir()
            .unwrap()
            .join("windows-app-manifest.xml");
        println!("cargo:rerun-if-changed={}", manifest.display());
        println!("cargo:rustc-link-arg=/MANIFEST:EMBED");
        println!("cargo:rustc-link-arg=/MANIFESTINPUT:{}", manifest.display());
    }

    tauri_build::try_build(attributes).expect("failed to run tauri-build");
}
