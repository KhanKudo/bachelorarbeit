#define OTA_UPDATE
#include <Arduino.h>
#ifdef OTA_UPDATE
#include <ArduinoOTA.h>
#endif
#include <PubSubClient.h>

#ifdef ESP32
const char root_ca[] PROGMEM = R"EOF(
-----BEGIN CERTIFICATE-----
MIIFazCCA1OgAwIBAgIRAIIQz7DSQONZRGPgu2OCiwAwDQYJKoZIhvcNAQELBQAw
TzELMAkGA1UEBhMCVVMxKTAnBgNVBAoTIEludGVybmV0IFNlY3VyaXR5IFJlc2Vh
cmNoIEdyb3VwMRUwEwYDVQQDEwxJU1JHIFJvb3QgWDEwHhcNMTUwNjA0MTEwNDM4
WhcNMzUwNjA0MTEwNDM4WjBPMQswCQYDVQQGEwJVUzEpMCcGA1UEChMgSW50ZXJu
ZXQgU2VjdXJpdHkgUmVzZWFyY2ggR3JvdXAxFTATBgNVBAMTDElTUkcgUm9vdCBY
MTCCAiIwDQYJKoZIhvcNAQEBBQADggIPADCCAgoCggIBAK3oJHP0FDfzm54rVygc
h77ct984kIxuPOZXoHj3dcKi/vVqbvYATyjb3miGbESTtrFj/RQSa78f0uoxmyF+
0TM8ukj13Xnfs7j/EvEhmkvBioZxaUpmZmyPfjxwv60pIgbz5MDmgK7iS4+3mX6U
A5/TR5d8mUgjU+g4rk8Kb4Mu0UlXjIB0ttov0DiNewNwIRt18jA8+o+u3dpjq+sW
T8KOEUt+zwvo/7V3LvSye0rgTBIlDHCNAymg4VMk7BPZ7hm/ELNKjD+Jo2FR3qyH
B5T0Y3HsLuJvW5iB4YlcNHlsdu87kGJ55tukmi8mxdAQ4Q7e2RCOFvu396j3x+UC
B5iPNgiV5+I3lg02dZ77DnKxHZu8A/lJBdiB3QW0KtZB6awBdpUKD9jf1b0SHzUv
KBds0pjBqAlkd25HN7rOrFleaJ1/ctaJxQZBKT5ZPt0m9STJEadao0xAH0ahmbWn
OlFuhjuefXKnEgV4We0+UXgVCwOPjdAvBbI+e0ocS3MFEvzG6uBQE3xDk3SzynTn
jh8BCNAw1FtxNrQHusEwMFxIt4I7mKZ9YIqioymCzLq9gwQbooMDQaHWBfEbwrbw
qHyGO0aoSCqI3Haadr8faqU9GY/rOPNk3sgrDQoo//fb4hVC1CLQJ13hef4Y53CI
rU7m2Ys6xt0nUW7/vGT1M0NPAgMBAAGjQjBAMA4GA1UdDwEB/wQEAwIBBjAPBgNV
HRMBAf8EBTADAQH/MB0GA1UdDgQWBBR5tFnme7bl5AFzgAiIyBpY9umbbjANBgkq
hkiG9w0BAQsFAAOCAgEAVR9YqbyyqFDQDLHYGmkgJykIrGF1XIpu+ILlaS/V9lZL
ubhzEFnTIZd+50xx+7LSYK05qAvqFyFWhfFQDlnrzuBZ6brJFe+GnY+EgPbk6ZGQ
3BebYhtF8GaV0nxvwuo77x/Py9auJ/GpsMiu/X1+mvoiBOv/2X/qkSsisRcOj/KK
NFtY2PwByVS5uCbMiogziUwthDyC3+6WVwW6LLv3xLfHTjuCvjHIInNzktHCgKQ5
ORAzI4JMPJ+GslWYHb4phowim57iaztXOoJwTdwJx4nLCgdNbOhdjsnvzqvHu7Ur
TkXWStAmzOVyyghqpZXjFaH3pO3JLF+l+/+sKAIuvtd7u+Nxe5AW0wdeRlN8NwdC
jNPElpzVmbUq4JUagEiuTDkHzsxHpFKVK7q4+63SM1N95R1NbdWhscdCb+ZAJzVc
oyi3B43njTOQ5yOf+1CceWxG1bQVs5ZufpsMljq4Ui0/1lvh+wjChP4kqKOJ2qxq
4RgqsahDYVvTH9w7jXbyLeiNdd8XM2w9U/t7y0Ff/9yi0GE44Za4rF2LN9d11TPA
mRGunUHBcnWEvgJBQl9nJEiU0Zsnvgc/ubhPgXRR4Xq37Z0j4r7g1SgEEzwxA57d
emyPxgcYxn/eR44/KJ4EBs+lVDR3veyJm+kXQ99b21/+jh5Xos1AnX5iItreGCc=
-----END CERTIFICATE-----
)EOF";
#endif

#include <functional>
#include <map>
#include <vector>
#include <WiFiClient.h>
#ifdef ESP32
#include <WiFiClientSecure.h>
#include <WiFi.h>
#elif defined(ESP8266)
#include <ESP8266WiFi.h>
#include <Updater.h>
#include <Hash.h>
#endif

#ifdef TIME
#include <ezTime.h>
#endif

void _ha_device_init_features();

struct _HA_DEVICE
{
private:
    struct Interval
    {
        uint32_t nextMillis;
        uint16_t ms;
        std::function<void(void)> func;
    };

    bool serverStatus = true;

    String name = "Nugget";
    String codeName = "nugget";
    String id = "1c0b6b12-9592-4e84-baf0-8e1cfe8624f6";

    std::function<void(void)> listener = []() {};

    std::map<String, std::function<void(String)>> listeners;

    std::function<void(void)> onServerOnlineListener = []() {};
    std::function<void(void)> onServerOfflineListener = []() {};

    std::map<uint32_t, std::function<void(void)>> timeouts;
    std::vector<_HA_DEVICE::Interval> intervals;
    std::vector<std::function<void(void)>> loopers;

    WiFiClient wifiClient;
    WiFiClientSecure wifiClientSecure;
    PubSubClient client = PubSubClient(wifiClient);

    String availabilityTopic = "home/nugget/availability";

    uint32_t timeoutLoopLimiter = 0;
    uint32_t intervalLoopLimiter = 0;
    uint32_t lastMillis = 0;

#ifdef OTA_UPDATE
    enum ServerType
    {
        UPDATE_AVAILABLE,
        UPDATE_SIZE,
        CHUNK,
        RESTART_DEVICE,
        ABORT_UPDATE
    };

    enum ClientType
    {
        REGISTER, // MUST BE VALUE 0 (zero, null, '\0')
        GET_UPDATE_SIZE,
        GET_FIRST_CHUNK, // determines chunksize
        GET_CHUNK,
        UPDATE_SUCCESSFUL,
        UPDATE_FAILED
    };

    bool waitingForUpdateSize = false;
    bool isUpdating = false;
    uint16_t chunkIndex = 0;
    String otaServer = "dev/bed3f3229f2437610546058cce98b120/s";
    const char otaClient[39] = "dev/bed3f3229f2437610546058cce98b120/c";
    uint8_t otaTX[5];
    uint32_t remainingBytes = 0;
#endif

    std::function<void(char *, byte *, unsigned int)> callback = [this](char *char_topic, byte *payload, unsigned int length)
    {
        String topic = char_topic;

#ifdef OTA_UPDATE
        if (topic == otaServer)
        {
            if (payload[0] == ServerType::UPDATE_AVAILABLE)
            {
                if (waitingForUpdateSize || isUpdating)
                    goto ota_fail;

                // Serial.println("Updating firmware...");
                waitingForUpdateSize = true;

                otaTX[0] = ClientType::GET_UPDATE_SIZE;
                client.publish(otaClient, otaTX, 1, false);
            }
            else if (payload[0] == ServerType::UPDATE_SIZE)
            {
                if (!waitingForUpdateSize || length != 5)
                    goto ota_fail;

                remainingBytes = *(uint32_t *)(payload + 1);

                if (!Update.begin(remainingBytes))
                    goto ota_fail;

                isUpdating = true;
                waitingForUpdateSize = false;
                otaTX[0] = ClientType::GET_FIRST_CHUNK;
                chunkIndex = 0;
                *(uint16_t *)(otaTX + 1) = (uint16_t)250;
                client.publish(otaClient, otaTX, 3, false);
            }
            else if (payload[0] == ServerType::CHUNK)
            {
                if (!isUpdating || length < 4 || remainingBytes < length - 3)
                    goto ota_fail;

                if (*(uint16_t *)(payload + 1) != chunkIndex)
                    goto ota_fail;

                if (Update.write(payload + 3, length - 3) != length - 3)
                {
                    Update.printError(Serial);
                    goto ota_fail;
                }

                remainingBytes -= length - 3;
                if (remainingBytes == 0)
                {
                    if (!Update.end())
                        goto ota_fail;

                    isUpdating = false;
                    otaTX[0] = ClientType::UPDATE_SUCCESSFUL;
                    client.publish(otaClient, otaTX, 1, false);
                }
                else
                {
                    otaTX[0] = ClientType::GET_CHUNK;
                    chunkIndex++;
                    *(uint16_t *)(otaTX + 1) = chunkIndex;
                    client.publish(otaClient, otaTX, 3, false);
                }
            }
            else if (payload[0] == ServerType::RESTART_DEVICE)
            {
#ifdef ESP32
                if (isUpdating)
                    Update.abort();
#endif
                // Serial.printf("RESTART_DEVICE command received\n");
                // Serial.printf("Restarting...\n");

                client.disconnect();
                // WiFi.reconnect();
                ESP.restart();
            }
            else if (payload[0] == ServerType::ABORT_UPDATE)
            {
#ifdef ESP32
                if (isUpdating)
                    Update.abort();
#endif
                isUpdating = false;
                waitingForUpdateSize = false;
                // Serial.printf("ABORT_UPDATE command received\n");
            }

            return;
        ota_fail:
            if (isUpdating)
            {
#ifdef ESP32
                Update.abort();
#endif
                isUpdating = false;
            }

            waitingForUpdateSize = false;
            otaTX[0] = ClientType::UPDATE_FAILED;
            client.publish(otaClient, otaTX, 1, false);
            return;
        }
#endif

        String message = "";

        for (int i = 0; i < length; i++)
        {
            message += (char)payload[i];
        }

        listeners.at(topic)(message);
    };

    void reconnect()
    {
        if (!client.connected())
        {
            if ((availabilityTopic == "" && client.connect(codeName.c_str(), _user, _pass)) ||
                client.connect(codeName.c_str(),
                               _user,
                               _pass,
                               availabilityTopic.c_str(),
                               0,
                               true,
                               "offline"))
            {
                connected();
            }
        }
    }

    void connected()
    {
        client.subscribe("homeassistant/status");
#ifdef OTA_UPDATE
        client.subscribe(otaServer.c_str());
#endif

        for (auto it = listeners.cbegin(); it != listeners.cend(); it++)
        {
            client.subscribe(it->first.c_str());
        }

        if (availabilityTopic != "")
        {
            client.publish(availabilityTopic.c_str(), "online", true);
        }
    }

    const char *_ssid;
    const char *_password;
    const char *_broker;
    bool _isEncrypted;
    uint _port;
    const char *_user;
    const char *_pass;

    uint32_t restartTimeout = 0;

public:
#ifdef TIME
    Timezone time;
#endif

    void init(const char *ssid = "wifi-user", const char *password = "wifi-pass", const char *broker = "example.com", bool isEncrypted = true, uint port = 8885, const char *user = "mqtt-user", const char *pass = "mqtt-pass")
    {
        _ssid = ssid;
        _password = password;
        _broker = broker;
        _isEncrypted = isEncrypted;
        _port = port;
        _user = user;
        _pass = pass;

        _ha_device_init_features();

        if (isEncrypted)
        {
#ifdef ESP32
            wifiClientSecure.setCACert(root_ca);
#elif defined(ESP8266)
            wifiClientSecure.setInsecure();
#endif
            client.setClient(wifiClientSecure);
        }

        WiFi.mode(WIFI_STA);
        WiFi.setAutoReconnect(true);
        WiFi.begin(ssid, password);

#ifndef TIME
        while (!WiFi.isConnected())
        {
            delay(100);
        }
#else
        waitForSync();
        time.setLocation("Europe/Vienna");
#endif

#ifdef OTA_UPDATE
        ArduinoOTA.setHostname(codeName.c_str());
        ArduinoOTA.begin();
#endif

        client.setServer(broker, port);
        client.setCallback(callback);

        client.setBufferSize(1023);

        subscribe("homeassistant/status", [this](String status)
                  {
            bool newStatus = false;
            if(status == "online") {
                newStatus = true;
            }
            else if (status == "offline") {
                newStatus = false;
            }

            if (serverStatus != newStatus) {
                serverStatus = newStatus;
                if(newStatus)
                    onServerOnlineListener();
                else
                    onServerOfflineListener();
            }
            /**/ });

        reconnect();

        publish("homeassistant/light/light/config", R"=-=-=({"has_entity_name":true,"~":"homeassistant/light/light","name":"Light","unique_id":"light","retain":true,"device":{"manufacturer":"Seeed Studio","model":"esp32c6","name":"Nugget","suggested_area":"Bedroom","sw_version":"0.1.0","identifiers":"1c0b6b12-9592-4e84-baf0-8e1cfe8624f6"},"availability_topic":"home/nugget/availability","command_topic":"~/command","state_topic":"~/state","schema":"json","brightness":true,"supported_color_modes":["brightness"],"max_kelvin":6500,"min_kelvin":2700,"color_temp_kelvin":true,"brightness_scale":255,"effect":false})=-=-=", true);


#ifdef OTA_UPDATE
        client.publish(otaClient, (uint8_t *)"\0bed3f3229f2437610546058cce98b1200000000000000000", 49, true);
#endif
    }

    void loop()
    {
        if (!WiFi.isConnected())
        {
            if (restartTimeout == 0)
            {
                restartTimeout = millis() + 5 * 60 * 1000; // 5 Minutes
            }

            WiFi.begin(_ssid, _password);

            WiFi.waitForConnectResult();
        }

        if (restartTimeout > 0 && millis() > restartTimeout)
        {
            ESP.restart();
        }

        if (!WiFi.isConnected())
            return;

        if (!client.connected())
        {
#ifdef OTA_UPDATE
            if (waitingForUpdateSize || isUpdating)
            {
#ifdef ESP32
                if (isUpdating)
                    Update.abort();
#endif
                waitingForUpdateSize = false;
                isUpdating = false;
            }
#endif

            if (restartTimeout == 0)
            {
                restartTimeout = millis() + 5 * 60 * 1000; // 5 Minutes
            }

            reconnect();
        }
        else
        {
            if (restartTimeout != 0)
            {
                restartTimeout = 0;
            }
        }

        client.loop();
#ifdef OTA_UPDATE
        ArduinoOTA.handle();
#endif

#ifdef TIME
        events();
#endif

        if (millis() != lastMillis)
        {
            lastMillis = millis();
            for (auto it = loopers.cbegin(); it != loopers.cend(); ++it)
                (*it)();
        }

        if (timeouts.size() > 0 && millis() > timeoutLoopLimiter)
        {
            uint32_t *passed = new uint32_t(timeouts.size());
            const uint32_t cur_ms = millis();
            timeoutLoopLimiter = cur_ms + 100;
            int count = 0;
            for (auto it = timeouts.cbegin(); it != timeouts.cend(); ++it)
            {
                yield();
                if (cur_ms >= it->first)
                {
                    it->second();
                    passed[count] = it->first;
                    count++;
                }
            }

            while (--count >= 0)
            {
                timeouts.erase(passed[count]);
            }

            free(passed);
        }

        if (intervals.size() > 0 && millis() > intervalLoopLimiter)
        {
            const uint32_t cur_ms = millis();
            intervalLoopLimiter = cur_ms + 10;
            for (auto it = intervals.begin(); it != intervals.end(); ++it)
            {
                yield();
                if (cur_ms >= it->nextMillis)
                {
                    it->func();
                    it->nextMillis = cur_ms + it->ms;
                }
            }
        }
    }

    void subscribe(const char *topic, std::function<void(String)> listener)
    {
        listeners.insert(std::pair<String, std::function<void(String)>>(String(topic), listener));
    }

    void publish(const char *topic, const char *message, bool retain = false)
    {
        client.publish(topic, message, retain);
    }

    void clearRetain(const char *topic)
    {
        client.publish(topic, "", true);
    }

    // returns true for online and false for offline
    bool getServerStatus()
    {
        return serverStatus;
    }

    void onServerOnline(std::function<void(void)> listener)
    {
        onServerOnlineListener = listener;
    }

    void onServerOffline(std::function<void(void)> listener)
    {
        onServerOfflineListener = listener;
    }

    // calls the callback after roughly the specified time in ms has passed
    void setTimeout(uint16_t ms, std::function<void(void)> callback)
    {
        timeouts.insert(std::pair<uint32_t, std::function<void(void)>>(millis() + ms, callback));
    }

    // calls the callback roughly every N ms, resolution of up to 10ms!
    // WARNING: once registered, cannot be unregistered!
    void setInterval(uint16_t ms, std::function<void(void)> callback)
    {
        intervals.push_back({millis() + ms, ms, callback});
    }

    // add callback to be executed in the loop, at most every 1ms!
    void setLooper(std::function<void(void)> callback)
    {
        loopers.push_back(callback);
    }
} device;

#define OUTPUT_HANDLE 
#define OUTPUT_PIN 15
#define OUTPUT_INVERT 255
#define INITIAL_BRIGHTNESS 102


#include <ArduinoJson.h>

struct _light
{
private:
    const String name = "Light";

    const String commandTopic = "homeassistant/light/light/command";
    const String stateTopic = "homeassistant/light/light/state";

    const bool retain = true;

    const uint16_t intervalFreqHz = 100;
    const uint8_t intervalDeltaMs = 1000 / intervalFreqHz;

    bool initialSetup = true;

#ifdef OUTPUT_MODE_ONOFF
    std::function<void(bool)> state_listener = [](bool state)
    {
        digitalWrite(OUTPUT_PIN, OUTPUT_INVERT ? !state : state);
    };
#elif !defined(OUTPUT_HANDLE)
    std::function<void(bool)> state_listener = [](bool) {};
#endif
    bool state = false;

    uint8_t brightnessTarget = 0;
    uint8_t brightnessStep = 0;
    uint16_t brightnessDeltaMs = 0;
    uint32_t brightnessNextMillis = 0;
    uint8_t brightness = 0;
#ifdef OUTPUT_HANDLE
    std::function<void(uint8_t)> brightness_listener = [this](uint8_t brightness)
    {
#ifdef OUTPUT_PIN
        ledcWrite(OUTPUT_PIN, OUTPUT_INVERT ? OUTPUT_INVERT - brightness : brightness);
#elif defined(OUTPUT_PIN_W) && !defined(OUTPUT_PIN_R)
        ledcWrite(OUTPUT_PIN_W, OUTPUT_INVERT_W ? OUTPUT_INVERT_W - getWarm() : getWarm());
        ledcWrite(OUTPUT_PIN_C, OUTPUT_INVERT_C ? OUTPUT_INVERT_C - getCold() : getCold());
#endif
    };
#else
    std::function<void(uint8_t)> brightness_listener = [](uint8_t) {};
#endif

    StaticJsonDocument<256> jsonMsg;

    StaticJsonDocument<256> jsonState;
    StaticJsonDocument<256> jsonRetainedCommand;

public:

    const uint8_t resolution = 8;

    void _init()
    {
#ifdef OUTPUT_MODE_ONOFF
        pinMode(OUTPUT_PIN, OUTPUT);
        digitalWrite(OUTPUT_PIN, INITIAL_BRIGHTNESS);
#else
#ifdef OUTPUT_PIN
        ledcAttach(OUTPUT_PIN, 16384, 8);
        ledcWrite(OUTPUT_PIN, INITIAL_BRIGHTNESS);
#endif
#ifdef OUTPUT_PIN_R
        ledcAttach(OUTPUT_PIN_R, 16384, 8);
        ledcWrite(OUTPUT_PIN_R, 0);
#endif
#ifdef OUTPUT_PIN_G
        ledcAttach(OUTPUT_PIN_G, 16384, 8);
        ledcWrite(OUTPUT_PIN_G, 0);
#endif
#ifdef OUTPUT_PIN_B
        ledcAttach(OUTPUT_PIN_B, 16384, 8);
        ledcWrite(OUTPUT_PIN_B, 0);
#endif
#ifdef OUTPUT_PIN_W
        ledcAttach(OUTPUT_PIN_W, 16384, 8);
        ledcWrite(OUTPUT_PIN_W, INITIAL_BRIGHTNESS_W);
#endif
#ifdef OUTPUT_PIN_C
        ledcAttach(OUTPUT_PIN_C, 16384, 8);
        ledcWrite(OUTPUT_PIN_C, INITIAL_BRIGHTNESS_C);
#endif
#endif

        if (!retain)
        {
            device.clearRetain(commandTopic.c_str());
            device.clearRetain(stateTopic.c_str());
        }

        device.subscribe(commandTopic.c_str(), [this](String message)
                         {
                            deserializeJson(jsonMsg, message);

                            jsonState.clear();

                            if(jsonMsg.containsKey("retain-recovery") && jsonMsg["retain-recovery"] == true){
                                if(initialSetup)
                                    initialSetup = false;
                                else
                                    return;
                            }

                            if(jsonMsg.containsKey("state")){
                                if(jsonMsg["state"] != "ON" && jsonMsg["state"] != "OFF") return;

                                bool newState = jsonMsg["state"] == "ON";
                                if(state != newState){
                                    state = newState;

                                    if(!newState || jsonRetainedCommand.containsKey("brightness")){
                                        if(jsonMsg.containsKey("transition")){
                                            if(!newState && brightness != 0)
                                                state = true;

                                            brightnessTarget = newState ? jsonRetainedCommand["brightness"] : 0;
                                            if(brightness != brightnessTarget){
                                                brightnessStep = max(1, (int)min(abs((float)brightnessTarget - (float)brightness), round(abs((float)brightnessTarget - (float)brightness) / ((float)intervalFreqHz * (float)jsonMsg["transition"]))));
                                                brightnessDeltaMs = round((1000.0f * (float)jsonMsg["transition"] * (float)brightnessStep) / abs((float)brightnessTarget - (float)brightness));
                                                brightnessNextMillis = millis() + brightnessDeltaMs;
                                            }
                                            jsonState["brightness"] = brightnessTarget;
                                        }
                                        else{
                                            brightness = newState ? jsonRetainedCommand["brightness"] : 0;
                                            jsonState["brightness"] = brightness;
                                        }
                                    }
                                }
                                jsonState["state"] = jsonMsg["state"];
                            }

                            if(jsonMsg.containsKey("brightness")){
                                if(jsonMsg.containsKey("transition")){
                                    brightnessTarget = jsonMsg["brightness"];
                                    if(brightness != brightnessTarget){
                                        brightnessStep = max(1, (int)min(abs((float)brightnessTarget - (float)brightness), round(abs((float)brightnessTarget - (float)brightness) / ((float)intervalFreqHz * (float)jsonMsg["transition"]))));
                                        brightnessDeltaMs = round((1000.0f * (float)jsonMsg["transition"] * (float)brightnessStep) / abs((float)brightnessTarget - (float)brightness));
                                        brightnessNextMillis = millis() + brightnessDeltaMs;
                                    }
                                    else if(brightness == 0){
                                        state = false;
                                    }
                                }
                                else{
                                    brightness = jsonMsg["brightness"];
                                    if(brightness == 0)
                                        state = false;
                                    brightnessStep = 0;
                                }

                                if(jsonMsg["brightness"] == 0)
                                    jsonState["state"] = "OFF";
                                else if(!state){
                                    state = true;
                                    jsonState["state"] = "ON";
                                }
                                jsonState["brightness"] = jsonMsg["brightness"];
                            }

                            // --------------------------------------------------

                            if(jsonState.containsKey("brightness") && !jsonMsg.containsKey("transition")){
                                brightness_listener(brightness);
                            }

#if defined(OUTPUT_MODE_ONOFF) || !defined(OUTPUT_HANDLE)
                            if(jsonState.containsKey("state")){
                                state_listener(state);
                            }
#endif

                            char responseMsg[256];
                            serializeJson(jsonState, responseMsg, 256);
                            device.publish(stateTopic.c_str(), responseMsg, retain);

                            if(retain){
                                if(jsonMsg.containsKey("state"))
                                    jsonRetainedCommand["state"] = jsonMsg["state"];
                                if(jsonMsg.containsKey("brightness"))
                                    jsonRetainedCommand["brightness"] = jsonMsg["brightness"];

                                jsonRetainedCommand["retain-recovery"] = true;
                                serializeJson(jsonRetainedCommand, responseMsg, 256);
                                device.publish(commandTopic.c_str(), responseMsg, true);
                            }

                            if(jsonMsg.containsKey("flash")){
                                device.setTimeout(((uint32_t)jsonMsg["flash"]) * 1000, [this](){
                                    device.publish(commandTopic.c_str(), "{\"state\":\"OFF\"}", retain);
                                });
                            } });

        bool needLooper = false;
        needLooper = true;

        if (needLooper)
            device.setLooper([this](void)
                             {
                                 if (brightnessStep != 0 && millis() >= brightnessNextMillis)
                                 {
                                     // mult to compensate for potential loop-lag, causing multiple trigger skips
                                     const float step = (float)brightnessStep * max(1.0f, floor((float)(millis() - brightnessNextMillis) / (float)brightnessDeltaMs));
                                     if (abs((float)brightnessTarget - (float)brightness) <= step)
                                     {
                                         brightness = brightnessTarget;
                                         brightnessStep = 0;
                                     }
                                     else
                                     {
                                         if (brightnessTarget < brightness)
                                             brightness -= step;
                                         else
                                             brightness += step;
                                         brightnessNextMillis = millis() + brightnessDeltaMs;
                                     }
                                     brightness_listener(brightness);

                                     if (brightness == 0)
                                     {
                                         state = false;
#if defined(OUTPUT_MODE_ONOFF) || !defined(OUTPUT_HANDLE)
                                         state_listener(state);
#endif
                                     }
                                 }

                             });
    }

    bool getState()
    {
        return state;
    }

    void setState(bool newState)
    {
        StaticJsonDocument<32> jsonDoc;
        jsonDoc["state"] = newState ? "ON" : "OFF";

        char message[32];
        serializeJson(jsonDoc, message, 32);
        jsonDoc.clear();
        device.publish(commandTopic.c_str(), message, retain);
    }

#ifndef OUTPUT_HANDLE
    // only one listener will work, newest overwrites previous
    void onState(std::function<void(bool)> _listener)
    {
        state_listener = _listener;
    }
#endif

    uint8_t getBrightness()
    {
        return brightness;
    }

    void setBrightness(uint8_t newBrightness)
    {
        bool newState = newBrightness > 0;

        StaticJsonDocument<64> jsonDoc;
        jsonDoc["state"] = newState ? "ON" : "OFF";

        jsonDoc["brightness"] = newBrightness;

        char message[64];
        serializeJson(jsonDoc, message, 64);
        jsonDoc.clear();
        device.publish(commandTopic.c_str(), message, retain);
    }

#ifndef OUTPUT_HANDLE
    // only one listener will work, newest overwrites previous
    void onBrightness(std::function<void(uint8_t)> _listener)
    {
        brightness_listener = _listener;
    }
#endif

} light;
#undef OUTPUT_HANDLE
#undef OUTPUT_PIN
#undef OUTPUT_INVERT
#undef INITIAL_BRIGHTNESS

void _ha_device_init_features()
{
    light._init();
}