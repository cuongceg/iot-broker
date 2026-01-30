#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <time.h>

#define WIFI_SSID   ""
#define WIFI_PASS   ""
#define BROKER_IP   "192.168.1.42"
#define BROKER_PORT 1883
#define DEVICE_ID   "esp-door-01"
#define FW_VERSION  "1.0.3"

// Chân đọc module 817
const int PIN_SENSOR_24V = 23; 
// Chân điều khiển Relay
const int PIN_RELAY = 22;      

// Kích mức thấp tương đương với bật
const bool RELAY_ACTIVE_LOW = true; 

#define HEALTH_INTERVAL_MS 3000

WiFiClient espClient;
PubSubClient mqtt(espClient);

// Topics MQTT
String tCmdOpen      = String("doorlock/") + DEVICE_ID + "/cmd/open";
String tCmdResp      = String("doorlock/") + DEVICE_ID + "/cmd/response";
String tEventHealth  = String("doorlock/") + DEVICE_ID + "/event/health";

unsigned long lastHealth = 0;
unsigned long lastSensorRead = 0;

bool sensorActive = false;      // Có điện 24V hay không
bool mqttCommandState = false;  

time_t nowTs() { 
  return time(nullptr); 
}

void ntpSync() {
  configTime(7*3600, 0, "pool.ntp.org", "time.google.com"); // GMT+7
  Serial.print("Sync NTP");
  for (int i=0; i<20 && nowTs() < 100000; i++) { delay(500); Serial.print("."); }
  Serial.println();
}

void setRelay(bool stateOn) {
  if (stateOn) {
    digitalWrite(PIN_RELAY, RELAY_ACTIVE_LOW ? LOW : HIGH);
  } else {
    digitalWrite(PIN_RELAY, RELAY_ACTIVE_LOW ? HIGH : LOW);
  }
}

void updateOutputState() {
  // Bật nếu có tín hiệu từ 1 trong 2 nguồn
  bool shouldBeOn = sensorActive || mqttCommandState;
  setRelay(shouldBeOn);
  Serial.print("Sensor: "); Serial.print(sensorActive);
  Serial.print(" | MQTT Cmd: "); Serial.print(mqttCommandState);
  Serial.print(" -> Output: "); Serial.println(shouldBeOn ? "ON" : "OFF");
}

void wifiConnect() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("WiFi connecting");
  while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }
  Serial.println("\nWiFi OK, IP: " + WiFi.localIP().toString());
}

void publishJson(const String& topic, const JsonDocument& doc, bool retained=false) {
  String payload;
  serializeJson(doc, payload);
  mqtt.publish(topic.c_str(), payload.c_str(), retained);
}

void sendResponse(const char* lockValue) {
  StaticJsonDocument<256> doc;
  doc["ts"] = (long)nowTs();
  doc["v"]  = 1;
  JsonObject data = doc.createNestedObject("data");
  data["lock1"] = lockValue;
  JsonObject meta = doc.createNestedObject("meta");
  meta["fw"] = FW_VERSION;
  publishJson(tCmdResp, doc, false);          
}

void sendHealth() {
  StaticJsonDocument<512> doc;
  doc["ts"] = (long)nowTs();
  doc["v"]  = 1;
  JsonObject data = doc.createNestedObject("data");
  int currentPinState = digitalRead(PIN_RELAY);
  bool isRelayOn;
  
  if (RELAY_ACTIVE_LOW) {
    isRelayOn = (currentPinState == LOW);
  } else {
    isRelayOn = (currentPinState == HIGH);
  }

  data["lock1"] = isRelayOn ? "on" : "off";
  
  doc["status"] = "on"; // Trạng thái thiết bị online
  
  JsonObject debug = doc.createNestedObject("debug");
  debug["sensor_24v"] = sensorActive;
  debug["mqtt_cmd"] = mqttCommandState;

  JsonArray acc = doc.createNestedArray("access_uuid");
  acc.add("123456");
  JsonObject meta = doc.createNestedObject("meta");
  meta["fw"] = FW_VERSION;
  
  publishJson(tEventHealth, doc, true);
}

void onMqttMessage(char* topic, byte* payload, unsigned int len) {
  StaticJsonDocument<256> doc;
  DeserializationError err = deserializeJson(doc, payload, len);
  if (err) { Serial.println("JSON error"); return; }

  if (String(topic) == tCmdOpen) {
    const char* lock1 = doc["command"]["lock1"] | "";
    
    if (strcmp(lock1, "on") == 0) {
      Serial.println("MQTT Command: ON");
      mqttCommandState = true; // Cập nhật biến trạng thái MQTT
      sendResponse("on");
    } else if (strcmp(lock1, "off") == 0) {
      Serial.println("MQTT Command: OFF");
      mqttCommandState = false; // Cập nhật biến trạng thái MQTT
      sendResponse("off");
    }
    updateOutputState();
  }
}

bool mqttConnectWithWill() {
  StaticJsonDocument<256> will;
  will["ts"] = (long)nowTs();
  will["v"]  = 1;
  JsonObject data = will.createNestedObject("data");
  data["lock1"] = "off";
  will["status"] = "off";
  JsonObject meta = will.createNestedObject("meta");
  meta["fw"] = FW_VERSION;

  String willPayload;
  serializeJson(will, willPayload);
  return mqtt.connect(
    DEVICE_ID,
    tEventHealth.c_str(), 0, true, willPayload.c_str()
  );
}

void mqttReconnect() {
  while (!mqtt.connected()) {
    Serial.print("MQTT connecting...");
    if (mqttConnectWithWill()) {
      Serial.println("connected");
      mqtt.subscribe(tCmdOpen.c_str(), 1); 
      sendHealth();
    } else {
      Serial.print(" failed rc="); Serial.println(mqtt.state());
      delay(2000);
    }
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_SENSOR_24V, INPUT_PULLUP);
  
  pinMode(PIN_RELAY, OUTPUT);
  setRelay(false); 

  wifiConnect();
  ntpSync();

  mqtt.setServer(BROKER_IP, BROKER_PORT);
  mqtt.setCallback(onMqttMessage);
}

void loop() {
  if (!mqtt.connected()) mqttReconnect();
  mqtt.loop();

  if (millis() - lastSensorRead >= 100) {
    lastSensorRead = millis();
    
    int sensorVal = digitalRead(PIN_SENSOR_24V);
    bool currentSensorState = (sensorVal == LOW);

    if (sensorActive != currentSensorState) {
       sensorActive = currentSensorState;
       if (sensorActive) Serial.println("Phát hiện 24V từ Sensor!");
       else Serial.println("Mất tín hiệu 24V từ Sensor.");
       
       updateOutputState(); 
    }
  }

  // 3. Gửi Health Check định kỳ
  if (millis() - lastHealth >= HEALTH_INTERVAL_MS) {
    lastHealth = millis();
    sendHealth();
  }
}