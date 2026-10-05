#include "ha-device.h"

void setup() {
  device.init("%SSID%", "%KEY%", "%BROKER%", true, 8883, "%USER%", "%PASS%");
}

void loop() { device.loop(); }