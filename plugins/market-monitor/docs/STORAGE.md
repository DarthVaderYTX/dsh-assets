# Local storage and operating-system support

All durable state lives in a single data directory supplied by the DSH host (or
by the CLI/SDK user), with the same file layout and behaviour on **Windows,
macOS and Linux**. Nothing in the persistence path depends on a hard-coded
path separator, shell, drive letter, POSIX permission bit or Windows-only API.

## Directory layout

```
<data-dir>/
  market-monitor.db        hot analysis cache (watchlist, settings, quotes, alerts, portfolio)
  market-monitor.db-wal    SQLite write-ahead log (automatic companion)
  market-monitor.db-shm    SQLite shared-memory file (automatic companion)
  warehouse.db             canonical reference/market/news warehouse
  warehouse.db-wal         SQLite WAL companion
  warehouse.db-shm         SQLite shared-memory companion
  runtime.json             sidecar discovery (port, token, pid), removed on shutdown
  sidecar.lock             per-directory single-instance lock
```

SQLite companion files are created and managed by SQLite itself; never copy a
database without its WAL/SHM partners while the engine is running. Use the
backup procedure below instead.

## Density-separated bars

Bar storage is keyed by **series + interval + timestamp** in both databases:
the hot `bars` table and the warehouse `market_bar` table use the interval as
part of the primary key. Daily (`1d`) and intraday (`5m`, `30m`) rows are
therefore separate rows/buckets and never overwrite or stand in for each other.

The service reads a range only from its own density:

| Chart range | Storage interval read |
| --- | --- |
| `1D` / `LIVE` | `5m` |
| `5D` | `30m` |
| `1M` / `3M` / `6M` / `1Y` | `1d` |

There is **no cross-density fallback**: if real 5m bars do not exist, `1D`
returns an explicit no-intraday-data error rather than daily closes; the daily
ranges never read intraday rows. `market:intraday` collects real 5m bars for
watched US securities and writes a separately stored 30m bucket.

## Path resolution

| Context | Data directory |
| --- | --- |
| DSH plugin | `<DSH_HOME>/market-monitor` (the host passes an absolute path) |
| Custom plugin config | `dataDir` (e.g. `D:\data\market-monitor`, `/srv/mm/data`, `~/mm-data`) |
| CLI/SDK with `DSH_HOME` | `$DSH_HOME/market-monitor` |
| CLI/SDK without `DSH_HOME` | `~/.market-monitor` |

- `~` and `~user` are expanded on every platform, including in the host's
  `dataDir` configuration and the Python CLI.
- Relative paths are resolved against the current working directory.
- Spaces, Unicode, mixed separators and long paths are supported; the Python
  engine receives the directory as a normal argument (never through a shell).
- The host expands `~` before spawning the sidecar, so the same config works on
  macOS/Linux and Windows.

## Cross-platform guarantees

| Concern | Implementation |
| --- | --- |
| Path construction | Python `pathlib.Path`; Node `path.join`/`path.resolve` |
| Text encoding | UTF-8 for `runtime.json` and all seed/config files; stdout handshake is UTF-8 (`PYTHONUTF8=1`) |
| Atomic discovery file | sibling temp file → flush/fsync → `os.replace`, with bounded retries for transient Windows sharing violations |
| SQLite durability | WAL journal, `synchronous=NORMAL`, 30 s connect / 15 s busy timeout, UTF-8 identifiers |
| Single instance | native advisory lock: `msvcrt.locking` on Windows, `fcntl.flock` on POSIX; released by the OS on crash |
| Process lifecycle | stdin-EOF watchdog, SIGINT/SIGTERM/SIGBREAK handlers, graceful `POST /api/v1/shutdown` |
| Interpreter discovery | bundled DSH runtime, Homebrew/system `/usr/bin`, Windows `LOCALAPPDATA`/`PATH`, explicit `pythonPath` |
| Process cleanup | `child.kill` + Windows `taskkill /T /F` fallback; no shell interpolation |
| Timestamps | ISO-8601 UTC strings; SQLite stores no platform-specific time type |

Data files are ordinary SQLite databases and JSON; a database directory can be
copied between Windows, macOS and Linux without conversion (keep the engine
stopped, or include the WAL/SHM files).

## Diagnostics

`GET /api/v1/data/status` (tool `data_status`) includes a `storage` object:

```json
{
  "platform": "win32",
  "os_name": "nt",
  "python": "3.12.14",
  "sqlite": "3.45.3",
  "path_separator": "\\",
  "paths": {
    "data_dir": "C:\\Users\\me\\.dsh\\market-monitor",
    "cache_db": "C:\\Users\\me\\.dsh\\market-monitor\\market-monitor.db",
    "warehouse_db": "C:\\Users\\me\\.dsh\\market-monitor\\warehouse.db",
    "runtime_file": "...\\runtime.json",
    "lock_file": "...\\sidecar.lock"
  },
  "exists": {"data_dir": true, "cache_db": true, "warehouse_db": true}
}
```

The sidecar status (`/health` through the host) also reports the interpreter
command, version, platform and data directory. `data_status` prints a
`Storage: <platform> · <data-dir> · SQLite <version>` line.

## Backup and migration

1. Stop the plugin (or `POST /api/v1/shutdown`) so the WAL is checkpointed.
2. Copy the entire data directory, including `-wal` and `-shm` files if the
   sidecar is still running.
3. Restore by pointing `dataDir` at the copied directory on any OS; schema
   migrations run automatically on startup.

For an online, consistent backup when one engine process is running, use
SQLite's backup API (`.backup`/`sqlite3.Connection.backup`) rather than a plain
file copy of only the `.db` file.

## Platform notes

- **Windows**: NTFS is the supported local filesystem. Antivirus/indexers can
  briefly open `runtime.json` or database files; the atomic replace retries and
  SQLite's busy timeout handle this. Use a local disk rather than a network
  share.
- **macOS**: APFS/HFS+ local volumes; Homebrew Python is discovered
  automatically, or set `pythonPath`.
- **Linux**: ext4/XFS/btrfs local volumes; system or bundled Python works.
  Keep the data directory on a local filesystem because SQLite WAL locking is
  not reliable on some network filesystems.
- **Case sensitivity**: filenames are fixed lowercase ASCII, so a directory
  created on Linux remains usable on case-insensitive Windows/macOS.
- **Permissions**: the data directory is created with the user's default
  umask; on POSIX you may prefer `chmod 700 <data-dir>` for a single-user
  profile. The discovery file containing the API token is created with mode
  `0600`, and the lock file is created with mode `0600` where supported.

## Verification

`python/tests/test_storage.py` exercises:

- layout/path resolution with spaces and non-ASCII directory names;
- `~` expansion and `DSH_HOME` defaults;
- UTF-8 atomic writes, overwrite, temp-file cleanup and Windows-style
  replacement retry;
- lock create/release (and exclusivity on POSIX);
- SQLite cache/warehouse create → write → close → reopen from a Unicode path;
- WAL mode and platform-neutral `storage_info`.

The Node sidecar test also covers platform-neutral `resolveDataDir` including
`~`, spaces and Unicode. The suite is written to run unchanged on all three
operating systems.
