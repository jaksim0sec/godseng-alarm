# 갓생알리미 (Android)

원본 `갓생알리미.html`을 **바이트 단위로 수정하지 않고** Android WebView의 `app/src/main/assets/index.html`에 탑재한 앱 프로젝트.

- 원본 화면, 버튼, CSS 애니메이션, 화면 전환, 설정 플로우는 WebView에서 동일한 HTML/JS가 실행된다.
- `MainActivity`는 Android 권한 화면, 설정 유지, 실제 앱 사용량 표시와 모니터 서비스를 연결한다.
- `MonitorService`는 사용 정보 접근을 허용한 기기에서 **선택한 개별 앱 패키지의 사용 시간**을 감시하고 경고를 발송한다.
- `WarningOverlay`는 원본 HTML의 경고 모달·시선·카운트다운을 다른 앱 위에 표시한다.
- 원본 자체에는 **10개 가상 앱 범주**가 있지만, Android의 `InstalledApps`가 실제 실행 가능한 설치 앱(런처 목록)을 조회하고 `PackageManager.getApplicationIcon`의 실제 아이콘을 연결한다. 원본 파일은 수정하지 않고 별도의 `native-adapter.js`에서 기존 `APPS` 데이터와 선택용 캐러셀을 갱신한다.
- 사용자에게 보이지 않는 백그라운드 서비스/런처 없는 패키지는 기본 설치 앱 목록에서 제외한다. 실제 앱 사용 시간은 Android 사용 정보에서 패키지별로 수집하며 가상 분류의 합산값으로 보여주지 않는다.
- 인사이트 중 주간 막대 분포와 순위 변동은 원본의 시뮬레이션 계산이며, 실측 일별 기록으로 교체하지 않았다.

## 빌드

Android Studio에서 이 저장소를 열고 Android SDK 35와 JDK 17로 `assembleDebug` 실행. GitHub Actions의 **Android APK** 워크플로에서 디버그 APK artifact도 생성한다.

## 권한과 배터리 정책

처음 시작하면 사용 정보 접근, 다른 앱 위에 표시, 알림 권한을 Android 설정에서 요청한다. **실제 승인된 항목에만 원본 체크 애니메이션을 표시**하고, 세 항목 모두 승인되고 설치 앱 로딩이 끝난 후 다음 화면으로 전환한다. 미승인 항목은 권한 화면에 남고 항목을 눌러 다시 요청할 수 있다. 감시는 사용자 허가 이후에만 시작되며, Android의 절전 정책 및 포그라운드 서비스 제한에 따라 백그라운드 알림이 지연될 수 있다. Android 14+의 `specialUse` 포그라운드 서비스는 배포 플랫폼의 별도 심사 대상이 될 수 있다.

## HTML 무손실 확인

`python3 scripts/check_parity.py` 실행. 파일 SHA-256과 12개 화면 및 원본 기능 존재를 검증한다. **이 검증은 네이티브 기기에서 실제 동작을 보증하는 테스트가 아니다.** APK 빌드 및 실기기에서의 권한/오버레이 검증이 추가로 필요하다.


## Android 2차 변경 (실제 앱 목록/권한 애니메이션)

- `InstalledApps.java`: 설치된 앱 패키지명·표시명·아이콘 PNG를 조회. APK에 특정 타사 아이콘을 하드코딩하지 않음
- `native-adapter.js`: 원본 캐러셀·홈·앱 추가·상세에서 참조하는 앱 데이터를 실제 목록으로 변경. 캐러셀 애니메이션과 체크 SVG는 원본 유지
- `MainActivity.permissionStatusJson()`: 실제 Android 사용 정보, 오버레이, 알림 활성 상태를 반환
- 권한 화면: 로딩 스피너는 요청 상태, 체크는 승인 확인 후에만. 거부했을 때 자동으로 다음 화면으로 넘어가지 않음
- `MonitorService`: 실제 앱 패키지 ID로 감시·경고 상태 관리
- `WarningOverlay`: 선택한 실제 앱 정보를 주입하여 기존 HTML 경고 애니메이션을 사용

검증: `scripts/check_parity.py`, `scripts/check_native_integrations.py`, `scripts/check_inline_js.py`. Android 기기 실동작과 APK 빌드는 GitHub Actions/기기에서 별도로 확인해야 함.
