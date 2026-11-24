# Android 백그라운드 감시: 배터리 비용 조사 및 개선 (2026-11-24)

## 요청 범위

- 사용자가 직접 **활성화**한 앱을 실행한 후, 연속 사용 시간이 **1분**에 도달하면 **일반 Android 알림 한 번**. 기존 단계 0~3 경고 및 앱별 시간·시간대 조건과 별도.
- 지속적으로 실행되는 `MonitorService`의 CPU/메모리/배터리 부하를 낮추되, 1분 알림과 기존 경고 기능을 없애지 않음.
- 기준 소스: `app/src/main/java/com/godseng/alarm/{MonitorService,UsageEngine,MainActivity,MonitorPolicy}.java`, `native-adapter.js`, `features.js`.

## 코드로 확인한 병목 (추정이나 측정값과 구분)

1. **주기적 조회**: 과거 `MonitorService.tick`이 화면 켜짐 여부와 앱 상태를 확인하지 않고 `Handler.postDelayed(...,12000)`을 반복. 이 콜백은 OS가 실제로 CPU를 깨우는 횟수와 동일하지 않지만, 실행할 때마다 조회 비용 발생.
2. **불필요한 하루 통계 스캔**: 등록 앱 활성 시 매번 `UsageEngine.getUsageJson(this)`으로 전 앱의 당일 사용 통계를 JSON으로 생성. 원래는 당일 시간 제한 기능이 없는 앱도 스캔.
3. **첫 시작 이벤트 스캔**: `currentForeground` 처음 실행 시 최대 8시간치 `UsageEvents`를 읽었음.
4. **UI 쪽 반복 실행**: 네이티브 어댑터는 권한 화면 밖에서도 450ms 타이머를 만들고, 45초마다 화면 노출 여부와 무관하게 사용 통계 갱신을 시도. Free Day UI도 매분 상태를 조회.
5. **마지막 앱 비활성화 후 서비스 종료 누락**: `Android.startMonitoring()`을 활성 앱이 있는 경우에만 호출했기 때문에, 전부 비활성화되면 `MainActivity.maybeStartMonitor()`의 `stopService()` 분기에 도달하지 않을 수 있었음.

## 적용한 개선

| 상황 | 이전 | 변경 후 |
|---|---|---|
| 화면 켜짐·미등록 앱 사용 | 12초 주기 확인 | 30초 주기 확인 |
| 화면 켜짐·감시 대상 앱 사용 | 12초 주기 확인 | 12초 기본, 첫 1분 도달 직전 정확한 경계에 맞춰 예약 |
| 화면 꺼짐 | 12초 주기 콜백 예약 유지 | 폴링 제거, `SCREEN_ON` / `USER_PRESENT` 시 재개 |
| 하루 누적 사용량 | 활성 확인할 때마다 전체 앱 조회 | 앱별 시간 조건을 쓸 때만 대상 패키지 조회, 최대 분당 1회 |
| Free Day | 감시 루프 계속 실행 | 해당 날짜에는 사용 기록 조회 생략, 다음 로컬 자정 또는 설정 변경 시 확인 |
| 이벤트 최초 스캔 | 지난 8시간 | 최근 최대 30분, 이후 증분 읽기. 긴 휴면 뒤에도 30분 상한 |
| 사용 통계 쿼리 실행 스레드 | 서비스 메인 `Handler` | `ExecutorService` 단일 작업자. 알림·오버레이만 메인 |
| 권한 UI 갱신 | 450ms 반복 확인 | Android `onResume`에서 동기화, 반복 확인 제거 |
| 프리데이 UI 날짜 전환 | 매분 타이머 | 다음 자정 타이머와 화면 복귀 이벤트 |
| 마지막 활성 앱 비활성화 | 모니터 서비스가 남을 수 있음 | 상태 즉시 저장 후 서비스 시작/종료 조건 재평가 |
| 감시 세션 알림 | 없음 | 활성화한 타사 앱의 실제 포그라운드 이벤트 시작 시점으로부터 1분 뒤 한 번 |

1분 알림에는 별도의 `godseng_one_minute` 알림 채널이 사용되며, 무한 반복 경고와 무관하다. 대상 앱에서 나오면 새 세션으로 취급하고, 기기 화면이 꺼진 시간은 연속 사용으로 계산하지 않도록 화면 복귀 시점을 반영한다. 서비스 재시작 시 같은 세션에서 중복 알림을 보내지 않도록 마지막 통지 키를 별도 저장한다.

**확실한 수치와 아직 모르는 수치**: 1시간 내내 화면이 켜지고 대상 앱을 사용하지 않는다고 가정하면 예약 주기는 이론적으로 **시간당 300회 → 120회(60% 감소)**. 대상 앱의 하루 누적 통계 조회는 **시간당 최대 300회 → 최대 60회(80% 감소)**. 이는 **설정된 작업 스케줄의 이론적 횟수**이지, 측정된 CPU 깨움 횟수나 실제 배터리 소모량은 아니다. 제조사·화면 상태·Doze·기타 작업에 따라 실제 결과는 다르다.

## 공식 Android 근거 및 설계 판단

- [UsageStatsManager](https://developer.android.com/reference/android/app/usage/UsageStatsManager): 권한을 얻은 앱의 사용 통계를 조회할 수 있으나, 빈번한 통계 호출을 무료 실시간 이벤트 수신으로 대체할 수는 없음
- [UsageEvents.Event](https://developer.android.com/reference/android/app/usage/UsageEvents.Event): 활동 시작 이벤트와 타임스탬프를 기반으로 연속 세션을 계산
- [Android 배터리/백그라운드 작업 최적화](https://developer.android.com/develop/background-work/background-tasks/optimize-battery): 일괄 처리·불필요한 CPU 각성 최소화
- [Doze와 앱 대기](https://developer.android.com/training/monitoring-device-state/doze-standby): 기기가 절전 모드에 들어가면 타이밍이 지연될 수 있음. 1분 정확도는 절대적인 실시간 보증이 아님
- [WorkManager 정기 작업](https://developer.android.com/develop/background-work/background-tasks/persistent/getting-started/define-work): 반복 간격이 최소 15분이므로 **1분 접속 알림을 대체할 수 없음**
- [Batterystats 측정](https://developer.android.com/topic/performance/power/setup-battery-historian) 및 [System Tracing/Perfetto](https://developer.android.com/topic/performance/tracing): 실제 개선량 확인

## 실기기 측정 계획 (작업 완료 판정과 분리)

동일 Android 기기·밝기·네트워크·앱 설정에서 이전 APK와 변경 APK를 비교해야 한다.

1. `adb shell dumpsys batterystats --reset` 후 30분간 **화면 꺼짐**, 30분간 **다른 앱 사용**, 30분간 **감시 대상 앱 사용**을 각각 기록
2. `adb shell dumpsys batterystats --charged com.godseng.alarm` 및 Android Studio System Trace/Perfetto에서 앱 프로세스 CPU 시간, 스케줄 실행 수, wake lock, 전력 추정치를 비교
3. 1분 알림은 55초·60초·65초, 화면 전환, 화면 꺼짐, Free Day, 앱 재실행, 서비스 재시작, 알림 권한 거부로 검증
4. 배터리 절약 모드와 제조사 앱 절전 정책에서 알림 지연·서비스 종료 가능성을 추가로 확인

**아직 미검증**: Android SDK/APK 빌드, 실기기 배터리 전력량, 기기별 알림 도착 시간, 시스템 배터리 제한 하의 동작. `scripts/MonitorPolicyTest.java`, `scripts/check_monitor_performance.py`는 코드 의도·일부 분기만 검증한다.
