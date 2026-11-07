//! Run child processes safely from a GUI app: no console window, no stdin (a hidden prompt can
//! never block us), and a hard timeout after which the child is killed.

use std::io::Read;
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

/// `CREATE_NO_WINDOW`: don't flash a console window for each child process.
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[derive(Debug)]
pub struct Output {
    pub success: bool,
    pub code: Option<i32>,
    pub stdout: Vec<u8>,
    pub stderr: Vec<u8>,
}

#[derive(Debug, thiserror::Error)]
pub enum ProcError {
    #[error("cannot start {program}: {source}")]
    Spawn {
        program: String,
        source: std::io::Error,
    },
    #[error("{program} did not finish within {secs}s and was stopped")]
    Timeout { program: String, secs: u64 },
    #[error("{program} failed: {source}")]
    Wait {
        program: String,
        source: std::io::Error,
    },
}

/// A `Command` preconfigured for background use.
pub fn command(program: &str) -> Command {
    let mut cmd = Command::new(program);
    cmd.stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    cmd.creation_flags(CREATE_NO_WINDOW);
    cmd
}

/// Run `cmd` to completion, killing it after `timeout`.
pub fn run(mut cmd: Command, timeout: Duration) -> Result<Output, ProcError> {
    let program = cmd.get_program().to_string_lossy().into_owned();
    let mut child = cmd.spawn().map_err(|source| ProcError::Spawn {
        program: program.clone(),
        source,
    })?;

    // Drain both pipes on threads so a chatty child can't fill a pipe buffer and stall.
    let mut out_pipe = child.stdout.take();
    let mut err_pipe = child.stderr.take();
    let out_thread = thread::spawn(move || {
        let mut buf = Vec::new();
        if let Some(p) = out_pipe.as_mut() {
            let _ = p.read_to_end(&mut buf);
        }
        buf
    });
    let err_thread = thread::spawn(move || {
        let mut buf = Vec::new();
        if let Some(p) = err_pipe.as_mut() {
            let _ = p.read_to_end(&mut buf);
        }
        buf
    });

    let deadline = Instant::now() + timeout;
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if Instant::now() >= deadline => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(ProcError::Timeout {
                    program,
                    secs: timeout.as_secs(),
                });
            }
            Ok(None) => thread::sleep(Duration::from_millis(50)),
            Err(source) => return Err(ProcError::Wait { program, source }),
        }
    };

    Ok(Output {
        success: status.success(),
        code: status.code(),
        stdout: out_thread.join().unwrap_or_default(),
        stderr: err_thread.join().unwrap_or_default(),
    })
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;

    #[test]
    fn captures_output() {
        let mut cmd = command("cmd.exe");
        cmd.args(["/d", "/c", "echo hello"]);
        let out = run(cmd, Duration::from_secs(10)).unwrap();
        assert!(out.success);
        assert_eq!(String::from_utf8_lossy(&out.stdout).trim(), "hello");
    }

    #[test]
    fn kills_on_timeout() {
        let mut cmd = command("powershell.exe");
        cmd.args([
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "Start-Sleep -Seconds 30",
        ]);
        let started = Instant::now();
        let err = run(cmd, Duration::from_millis(1500)).unwrap_err();
        assert!(matches!(err, ProcError::Timeout { .. }));
        assert!(started.elapsed() < Duration::from_secs(10));
    }

    #[test]
    fn stdin_is_closed_so_prompts_cannot_block() {
        // `set /p` waits for input; with stdin closed it returns immediately.
        let mut cmd = command("cmd.exe");
        cmd.args(["/d", "/c", "set /p X=prompt: & echo done"]);
        let out = run(cmd, Duration::from_secs(10)).unwrap();
        assert!(String::from_utf8_lossy(&out.stdout).contains("done"));
    }
}
