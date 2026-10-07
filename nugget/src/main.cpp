#include "ha-device.h"

float currentTemp = 20.0f;
float targetTemp = 25.0f;
float stepTemp = 0.0f;

float currentHum = 40.0f;
float targetHum = 50.0f;
float stepHum = 0.0f;

void setup() {
  device.init("%SSID%", "%KEY%", "%BROKER%", true, 8883, "%USER%", "%PASS%");

  device.setInterval(1000, [](){
    stepTemp = ((float)esp_random() / (float)UINT32_MAX) - 0.5f;
    targetTemp = currentTemp + (stepTemp * 2.0f);
    currentTemp = currentTemp + 0.15f * (targetTemp - currentTemp);

    if (currentTemp < -25.0f) currentTemp = -25.0f;
    if (currentTemp > 40.0f) currentTemp = 40.0f;
    temp.update(String(currentTemp));
  });

  device.setInterval(1000, [](){
    stepHum = ((float)esp_random() / (float)UINT32_MAX) - 0.5f;
    targetHum = currentHum + (stepHum * 2.0f);
    currentHum = currentHum + 0.15f * (targetHum - currentHum);

    if (currentHum < 20.0f) currentHum = 20.0f;
    if (currentHum > 80.0f) currentHum = 80.0f;
    hum.update(String(currentHum));
  });
}

void loop() {
  device.loop();
}