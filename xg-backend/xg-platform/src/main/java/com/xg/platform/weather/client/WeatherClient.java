package com.xg.platform.weather.client;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

/**
 * Thin client over 高德天气 (AMap weather) for the leave reminder pipeline. Best-effort
 * by design: any failure (no key configured, network error, upstream non-200,
 * unrecognized destination) returns {@code null} and the caller just omits the
 * weather segment. The leave reminder still goes out.
 *
 * <p>Endpoint: {@code https://restapi.amap.com/v3/weather/weatherInfo}
 * (free tier, 100w calls/day at the time of writing).
 *
 * <p>City extraction is deliberately a small static whitelist of major Chinese
 * cities and their adcode. The destination field is free text (e.g.
 * "回浙江杭州看望父母"), so we pick the longest substring match. Anything
 * outside the whitelist gracefully degrades to "no weather segment".
 */
@Slf4j
@Component
public class WeatherClient {

    private final RestTemplate restTemplate;
    private final ObjectMapper objectMapper;
    private final String apiKey;

    public WeatherClient(ObjectMapper objectMapper,
                         @Value("${weather.amap.key:}") String apiKey) {
        this.objectMapper = objectMapper;
        this.apiKey = apiKey;
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(2000);
        factory.setReadTimeout(4000);
        this.restTemplate = new RestTemplate(factory);
    }

    /** Whether weather lookup is configured. Mostly for log visibility. */
    public boolean isEnabled() {
        return apiKey != null && !apiKey.isBlank();
    }

    /**
     * Look up a one-line live weather summary suitable for a Chinese-language
     * notification body. Returns {@code null} if the key isn't set, the
     * destination text doesn't match the city whitelist, or the upstream fails.
     */
    public String fetchSummary(String destinationFreeText) {
        if (!isEnabled() || destinationFreeText == null || destinationFreeText.isBlank()) {
            return null;
        }
        String city = extractCity(destinationFreeText);
        if (city == null) return null;
        String adcode = CITY_ADCODES.get(city);
        if (adcode == null) return null;

        try {
            String url = "https://restapi.amap.com/v3/weather/weatherInfo"
                    + "?key=" + URLEncoder.encode(apiKey, StandardCharsets.UTF_8)
                    + "&city=" + adcode
                    + "&extensions=base";
            String body = restTemplate.getForObject(url, String.class);
            if (body == null) return null;
            return parseLive(city, body);
        } catch (Exception e) {
            log.warn("amap weather lookup failed city={} : {}", city, e.getMessage());
            return null;
        }
    }

    private String parseLive(String city, String json) throws Exception {
        Map<String, Object> root = objectMapper.readValue(json, new TypeReference<>() {});
        if (!"1".equals(String.valueOf(root.get("status")))) return null;
        Object livesObj = root.get("lives");
        if (!(livesObj instanceof List<?> lives) || lives.isEmpty()) return null;
        Object firstObj = lives.get(0);
        if (!(firstObj instanceof Map<?, ?> rawMap)) return null;
        String weather = strOrEmpty(rawMap.get("weather"));
        String temp = strOrEmpty(rawMap.get("temperature"));
        String wind = strOrEmpty(rawMap.get("winddirection"));
        String windPower = strOrEmpty(rawMap.get("windpower"));
        if (weather.isEmpty() && temp.isEmpty()) return null;
        return String.format("目的地%s当前%s %s°C，%s风%s级，注意天气变化。",
                city, weather, temp, wind, windPower);
    }

    /** Longest-substring match against the whitelist so "苏州市" extracts "苏州". */
    private String extractCity(String text) {
        String best = null;
        for (String c : CITY_ADCODES.keySet()) {
            if (text.contains(c) && (best == null || c.length() > best.length())) {
                best = c;
            }
        }
        return best;
    }

    private static String strOrEmpty(Object v) {
        return v == null ? "" : String.valueOf(v);
    }

    /**
     * Chinese prefecture-level cities → 高德 adcode. Covers 4 直辖市,
     * all 33 省会 / 自治区首府, all sub-provincial cities, and the major
     * prefecture-level cities where Chinese universities are located.
     * Cities outside this list return null from {@link #extractCity} and
     * the weather segment is silently skipped — admin can still save the
     * city name to school_city, just without weather support.
     *
     * Stays in sync with frontend {@code constants/schoolCities.ts}.
     */
    private static final Map<String, String> CITY_ADCODES = buildCityMap();

    private static Map<String, String> buildCityMap() {
        Map<String, String> m = new java.util.HashMap<>(140);
        // 直辖市
        m.put("北京", "110000"); m.put("上海", "310000"); m.put("天津", "120000"); m.put("重庆", "500000");
        // 河北
        m.put("石家庄", "130100"); m.put("唐山", "130200"); m.put("秦皇岛", "130300"); m.put("邯郸", "130400");
        m.put("邢台", "130500"); m.put("保定", "130600"); m.put("张家口", "130700"); m.put("承德", "130800");
        m.put("沧州", "130900"); m.put("廊坊", "131000"); m.put("衡水", "131100");
        // 山西
        m.put("太原", "140100"); m.put("大同", "140200"); m.put("阳泉", "140300"); m.put("长治", "140400");
        m.put("晋城", "140500"); m.put("朔州", "140600"); m.put("晋中", "140700"); m.put("运城", "140800");
        m.put("忻州", "140900"); m.put("临汾", "141000"); m.put("吕梁", "141100");
        // 内蒙古
        m.put("呼和浩特", "150100"); m.put("包头", "150200"); m.put("赤峰", "150400"); m.put("通辽", "150500");
        m.put("鄂尔多斯", "150600");
        // 辽宁
        m.put("沈阳", "210100"); m.put("大连", "210200"); m.put("鞍山", "210300"); m.put("抚顺", "210400");
        m.put("本溪", "210500"); m.put("丹东", "210600"); m.put("锦州", "210700"); m.put("营口", "210800");
        m.put("葫芦岛", "211400");
        // 吉林
        m.put("长春", "220100"); m.put("吉林市", "220200"); m.put("四平", "220300"); m.put("延边", "222400");
        // 黑龙江
        m.put("哈尔滨", "230100"); m.put("齐齐哈尔", "230200"); m.put("大庆", "230600"); m.put("牡丹江", "231000");
        // 江苏
        m.put("南京", "320100"); m.put("无锡", "320200"); m.put("徐州", "320300"); m.put("常州", "320400");
        m.put("苏州", "320500"); m.put("南通", "320600"); m.put("连云港", "320700"); m.put("淮安", "320800");
        m.put("盐城", "320900"); m.put("扬州", "321000"); m.put("镇江", "321100"); m.put("泰州", "321200");
        m.put("宿迁", "321300");
        // 浙江
        m.put("杭州", "330100"); m.put("宁波", "330200"); m.put("温州", "330300"); m.put("嘉兴", "330400");
        m.put("湖州", "330500"); m.put("绍兴", "330600"); m.put("金华", "330700"); m.put("衢州", "330800");
        m.put("舟山", "330900"); m.put("台州", "331000"); m.put("丽水", "331100");
        // 安徽
        m.put("合肥", "340100"); m.put("芜湖", "340200"); m.put("蚌埠", "340300"); m.put("淮南", "340400");
        m.put("马鞍山", "340500"); m.put("安庆", "340800"); m.put("黄山", "341000"); m.put("阜阳", "341200");
        m.put("六安", "341500");
        // 福建
        m.put("福州", "350100"); m.put("厦门", "350200"); m.put("莆田", "350300"); m.put("泉州", "350500");
        m.put("漳州", "350600"); m.put("龙岩", "350800"); m.put("宁德", "350900");
        // 江西
        m.put("南昌", "360100"); m.put("九江", "360400"); m.put("赣州", "360700"); m.put("宜春", "360900");
        m.put("上饶", "361100");
        // 山东
        m.put("济南", "370100"); m.put("青岛", "370200"); m.put("淄博", "370300"); m.put("枣庄", "370400");
        m.put("烟台", "370600"); m.put("潍坊", "370700"); m.put("济宁", "370800"); m.put("泰安", "370900");
        m.put("威海", "371000"); m.put("日照", "371100"); m.put("临沂", "371300"); m.put("德州", "371400");
        m.put("聊城", "371500"); m.put("滨州", "371600"); m.put("菏泽", "371700");
        // 河南
        m.put("郑州", "410100"); m.put("开封", "410200"); m.put("洛阳", "410300"); m.put("新乡", "410700");
        m.put("许昌", "411000"); m.put("南阳", "411300"); m.put("信阳", "411500");
        // 湖北
        m.put("武汉", "420100"); m.put("黄石", "420200"); m.put("宜昌", "420500"); m.put("襄阳", "420600");
        m.put("荆州", "421000"); m.put("黄冈", "421100");
        // 湖南
        m.put("长沙", "430100"); m.put("株洲", "430200"); m.put("湘潭", "430300"); m.put("衡阳", "430400");
        m.put("岳阳", "430600"); m.put("常德", "430700"); m.put("郴州", "431000");
        // 广东
        m.put("广州", "440100"); m.put("韶关", "440200"); m.put("深圳", "440300"); m.put("珠海", "440400");
        m.put("汕头", "440500"); m.put("佛山", "440600"); m.put("江门", "440700"); m.put("湛江", "440800");
        m.put("茂名", "440900"); m.put("肇庆", "441200"); m.put("惠州", "441300"); m.put("梅州", "441400");
        m.put("东莞", "441900"); m.put("中山", "442000"); m.put("潮州", "445100"); m.put("揭阳", "445200");
        // 广西
        m.put("南宁", "450100"); m.put("柳州", "450200"); m.put("桂林", "450300"); m.put("梧州", "450400");
        m.put("北海", "450500");
        // 海南
        m.put("海口", "460100"); m.put("三亚", "460200");
        // 四川
        m.put("成都", "510100"); m.put("自贡", "510300"); m.put("泸州", "510500"); m.put("德阳", "510600");
        m.put("绵阳", "510700"); m.put("乐山", "511100"); m.put("南充", "511300"); m.put("宜宾", "511500");
        m.put("达州", "511700");
        // 贵州
        m.put("贵阳", "520100"); m.put("遵义", "520300"); m.put("六盘水", "520200");
        // 云南
        m.put("昆明", "530100"); m.put("曲靖", "530300"); m.put("大理", "532900"); m.put("丽江", "530700");
        // 西藏
        m.put("拉萨", "540100");
        // 陕西
        m.put("西安", "610100"); m.put("宝鸡", "610300"); m.put("咸阳", "610400"); m.put("渭南", "610500");
        m.put("延安", "610600"); m.put("汉中", "610700"); m.put("榆林", "610800");
        // 甘肃
        m.put("兰州", "620100"); m.put("天水", "620500");
        // 青海
        m.put("西宁", "630100");
        // 宁夏
        m.put("银川", "640100");
        // 新疆
        m.put("乌鲁木齐", "650100");
        // 港澳台
        m.put("香港", "810000"); m.put("澳门", "820000");
        return java.util.Collections.unmodifiableMap(m);
    }
}
