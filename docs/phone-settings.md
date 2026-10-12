# Android 휴대폰 설정

2026-10-12 운영 조사에서 API 34 에뮬레이터의 modem simulator 연결이 `::1` 주소 해석 실패로 끊어졌다. 콘솔의 GSM home 응답과 달리 Android SIM 상태는 UNKNOWN/NOT_READY, 활성 subscription은 없었다. `docker-compose.yml`의 aiqa 컨테이너에 `net.ipv6.conf.lo.disable_ipv6: 1`을 설정해 modem simulator가 IPv4 loopback을 사용하도록 한다. 호스트와 다른 컨테이너의 설정은 변경하지 않는다. API 34의 cuttlefish RIL은 legacy modem과 호환되지 않으므로 ModemSimulator는 유지한다.

전화번호 적용은 콘솔 OK만으로 성공 처리하지 않는다. Android SIM이 READY/LOADED인지 검사하고, 적용 후 telephony subscription의 번호를 다시 읽어 요청값과 일치하는지 확인한다. 조회된 현재 번호를 설정 입력에 표시한다. 기기 모뎀에서 반영되지 않은 값은 오류로 알린다. 앱 소스는 변경하지 않는다.

운영 검증: IPv4 loopback 적용 후 SIM이 LOADED로 복구되고 기본 번호가 조회됐다. `emu phonenumber`의 OK만으로 subscription 번호가 갱신되지 않았으며, 전화 서비스 `com.android.phone`을 재시작해 SIM 레코드 캐시를 다시 읽은 뒤 번호가 일치했다. `restart-modem`만으로는 반복 변경 때 캐시가 남아 충분하지 않았다. 따라서 적용 과정에 해당 전화 서비스만 재시작하고 조회 재시도를 포함한다. 검증용 번호는 기본 번호로 복원했다. 실제 유심 가입번호 변경이나 앱 수정은 수행하지 않는다.

최종 운영 함수 검증은 테스트 번호 적용 → 기본 번호 복원 순서로 두 번 실행했고, 두 번 모두 `ok: true`, `numberMatches: true`를 확인했다. 전체 `node check.ts` 통과 후 운영 서버를 재시작했다.
