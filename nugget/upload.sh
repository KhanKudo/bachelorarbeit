#!/bin/bash
set -e

which git
which pio

[ -e src/.main.cpp.swp ] && ( echo '!!! prior build crashed: src/.main.cpp.swp still exists !!!' && exit 1)
[ -e .env ] || ( echo 'Missing .env' && exit 2)

if which bun || which node ; then
    mkdir -p .pio/ha-device-builder

    [ -e ".pio/ha-device-builder/ha-device-builder.js" ] || git clone --branch v0.1.0 --single-branch --depth 1 https://github.com/KhanKudo/ha-device-builder.git .pio/ha-device-builder

    which bun && RUN=bun || RUN=node
    $RUN .pio/ha-device-builder/ha-device-builder.js nugget.ha-device.yaml
fi

cp src/main.cpp src/.main.cpp.swp

while IFS= read -r line ; do
    [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue

    key="${line%%=*}"
    value="${line#*=}"

    value="${value//&/\\&}"
    value="${value//|/\\|}"

    sed -i "s|%$key%|$value|g" src/main.cpp
done < .env

trap "mv src/.main.cpp.swp src/main.cpp" EXIT SIGKILL SIGTERM

# pio run # just build
pio run -t upload # build & upload