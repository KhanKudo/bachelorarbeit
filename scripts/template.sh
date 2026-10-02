#!/usr/bin/env bash
# Auto-generated from %INPUT_YML% on %BUILD_DATE% - DO NOT EDIT DIRECTLY
set -euo pipefail
IFS=$'\n\t'

exit_handler() {
    local exit_code="$1"
    local line_no="$2"
    echo ""
    echo "[ERROR] Command failed with exit code ${exit_code} on line ${line_no}." >&2
    exit "${exit_code}"
}

trap 'exit_handler $? $LINENO' ERR

# === Environment & Array Initialization ===
[ -f ./.env ] && { set -a; source ./.env; set +a; }
[ -f ./%VMID%.env ] && { set -a; source ./%VMID%.env; set +a; }

{
    printf '=%.0s' {1..80}; echo ""
    echo "Script Executed at $(date '+%Y-%m-%d %H:%M:%S') from $(pwd) as $(whoami)"
    printf '=%.0s' {1..80}; echo ""
} >> ./%VMID%.log

# === Helper Functions ===
confirm() {
    if [ -z "$1" ]; then
        return 0
    fi

    while true; do
        read -p "$1 (y/n): " -r < /dev/tty
        case $REPLY in
            [Yy]* ) return 0;;
            [Nn]* ) echo "    Die Aufführun wurde abgebrochen!"; exit 1;;
            * ) echo "Ungültige Eingabe."; continue;;
        esac
    done
}

skip() {
    if [ -z "$1" ]; then
        return 1
    fi

    while true; do
        read -p "$1 (y/n): " -r < /dev/tty
        case $REPLY in
            [Yy]* ) return 1;;
            [Nn]* ) return 0;;
            * ) echo "Ungültige Eingabe."; continue;;
        esac
    done
}

# === Step Functions ===

#step-start#
# Name: %name%
# User: %user%
%id% () {
    echo "==> preparing step [%index% of %TOTAL%] as %user%: %name%" >> %LOGFILE%
    if [ -n '%envs%' ]; then # ask before check, if there are variables
        confirm "%confirm%"
        if skip "%skip%"; then echo '    Schritt %index% übersprungen!'; return 0; fi
    fi

    secret_vars=()
    sudo_env_args=()
    while IFS= read -r var_name; do
        if [[ "$var_name" == \$* ]]; then
            secret_vars+=("${var_name#\$}")
            continue
        fi

        [[ -z "$var_name" ]] && continue
        while ! [[ -v "$var_name" ]] || [[ -z "${!var_name}" ]]; do
            read -p "Bitte geben Sie einen Wert für '${var_name}' ein:" -r < /dev/tty
            [[ -z "$REPLY" ]] && echo "Ungültige Eingabe." && continue
            declare -g "$var_name=$REPLY"
        done
        echo "${var_name}=${!var_name}" >> %LOGFILE%
        sudo_env_args+=("${var_name}=${!var_name}")
    done <<< '%envs%'

    if %check_enabled%; then
        cat >> %LOGFILE% 2>&1 <<'SUDO_EOF'
Running following idempotent pre-check as user "%user%":
```
%check%
```
SUDO_EOF

        set +e
        sudo -u "%user%" "${sudo_env_args[@]}" bash -s >> %LOGFILE% 2>&1 << 'SUDO_EOF'
cd /tmp
set -euo pipefail
export XDG_RUNTIME_DIR="/run/user/$(id -u %user%)"
export DBUS_SESSION_BUS_ADDRESS="unix:path=${XDG_RUNTIME_DIR}/bus"

%check%

SUDO_EOF
        status=$?
        set -e

        if [ $status -eq 0 ]; then
            echo "----- pre-check passed (exit 0) - skipping step -----" >> %LOGFILE%
            echo '==> [%index%/%TOTAL%] %name% ... Bereits vorhanden!'
            return 0
        else
            echo "----- pre-check failed (exit $status) - proceeding with step execution -----" >> %LOGFILE%
        fi
    fi

    if [ -z '%envs%' ]; then # ask after check, if there are no variables
        confirm "%confirm%"
        if skip "%skip%"; then echo '    Schritt %index% übersprungen!'; return 0; fi
    fi

    for var_name in "${secret_vars[@]}"; do
        while ! [[ -v "$var_name" ]] || [[ -z "${!var_name}" ]]; do
            read -s -p "Bitte geben Sie einen Wert für '${var_name}' ein (versteckt):" -r < /dev/tty
            echo ''
            [[ -z "$REPLY" ]] && echo "Ungültige Eingabe." && continue
            declare -g "$var_name=$REPLY"
        done
        echo "${var_name}=**REDACTED**" >> %LOGFILE%
        sudo_env_args+=("${var_name}=${!var_name}")
    done

    echo -n '==> [%index%/%TOTAL%] %user%: %name%'

    for_var="%for%"

    if [[ -n "${for_var:-}" ]]; then
      for_values="${!for_var:-}"
    else
      for_values="-"
    fi

    if [[ -z "$for_values" ]]; then
        echo "----- for env is empty, skipping step loop execution -----" >> %LOGFILE%
        echo " ... Übersprungen! (env \"$for_var\" nicht vorhanden)"
    elif [[ -z "%for%" ]]; then
        echo -n ' ...'
    else
        echo ''
    fi

    cat >> %LOGFILE% 2>&1 <<'SUDO_EOF'
Running following code as user "%user%" (looping over: %for%):
```
%script%
```
SUDO_EOF

    idx=0
    while IFS= read -r line; do
        [[ -z "$line" ]] && continue

        echo "----- step execution loop iteration $idx for \"$line\" -----" >> %LOGFILE%

        [[ -n "%for%" ]] && echo -ne "    --> \"$line\" ..."

        ( while true; do sleep 2; echo -n "."; done ) &
        local dot_pid=$!
        trap "kill '$dot_pid' 2>/dev/null; echo ''" INT TERM

        set +e
        sudo -u "%user%" "${sudo_env_args[@]}" "index=$idx" "value=$line" "CWD=$(pwd)" bash -s >> %LOGFILE% 2>&1 << 'SUDO_EOF'
[ "%user%" == "root" ] && cd "$CWD" || cd /tmp
set -euo pipefail
export XDG_RUNTIME_DIR="/run/user/$(id -u %user%)"
export DBUS_SESSION_BUS_ADDRESS="unix:path=${XDG_RUNTIME_DIR}/bus"

%script%

SUDO_EOF
        status=$?
        set -e

        kill "$dot_pid" 2>/dev/null
        wait "$dot_pid" 2>/dev/null || true

        if [ $status -eq 0 ]; then
            echo "----- success - exit code $status -----" >> %LOGFILE%
            printf " Erfolgreich!\n"
        elif [ $status -eq 190 ]; then
            echo "----- already present - exit code $status -----" >> %LOGFILE%
            printf " Bereits vorhanden!\n"
        else
            echo "----- failed - exit code $status -----" >> %LOGFILE%
            printf " Fehlgeschlagen!\n"
            echo "Siehe mehr Details in %LOGFILE%:"
            echo ""
            echo ""
            echo ""
            tail -n 30 "%LOGFILE%"
            echo ""
            exit $status
        fi

        ((idx++)) || true
    done <<< "$for_values"
}

#step-end#

echo "[Prüfe sudo-Rechte]"
sudo true || { echo "Fehlgeschlagen!" >&2; exit 1; }
echo "Erfolgreich!"

# === Main Execution ===
#step-start#
%id%  # %user%: %name%
#step-end#