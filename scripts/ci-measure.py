"""Run a Linux CI command and record elapsed/CPU time and child maximum RSS.

ru_maxrss is the largest child's high-water mark, NOT simultaneous tree RSS.
No command arguments or environment variables are written to the measurement.
"""

import json
import resource
import subprocess
import sys
import time
from pathlib import Path

if len(sys.argv) < 3:
    raise SystemExit("Usage: ci-measure.py OUTPUT COMMAND [ARG...]")

started = time.monotonic()
result = subprocess.run(sys.argv[2:], check=False)
usage = resource.getrusage(resource.RUSAGE_CHILDREN)
Path(sys.argv[1]).write_text(json.dumps({
    "elapsed_seconds": time.monotonic() - started,
    "user_cpu_seconds": usage.ru_utime,
    "system_cpu_seconds": usage.ru_stime,
    "max_child_rss_kib": usage.ru_maxrss,
    "exit_code": result.returncode,
}, indent=2) + "\n")
raise SystemExit(result.returncode if result.returncode >= 0 else 128 - result.returncode)
