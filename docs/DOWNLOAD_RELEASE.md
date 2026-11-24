# 갓생알리미 다운로드 사이트 배포

## 현재 연결된 서비스

- 실제 다운로드 랜딩: **https://godseng-alarm-download.vercel.app/** (Vercel)
- 사이트 파일: `site/download.html` (최종 v3 원본의 3D 폰, 3개 언어, 원본 UI iframe 보존)
- 사이트 빌드 루트: `site/`, 생산 브랜치: `main`; 정적 파일만 Vercel에서 제공, 비공개 Android 소스는 웹에 포함하지 않음
- 홈 URL은 `site/vercel.json`으로 `/download.html`에 rewrite
- 소개 영상: `site/promo.mp4` (원본 29.52초, 약 2.8 MB). 영상 클릭 시에만 로드. 현재는 **Vercel 정적 파일**이며 Vercel Blob 사용은 아직 연결하지 않음.
- 영어·일본어·한국어 UI의 `lang` 선택과 기존 화면/경고 시연은 변경하지 않음.

## 실제 APK 다운로드 연결

`site/download.html`의 아래 설정을 사용:

```js
const RELEASE_REPO = "jaksim0sec/godseng-alarm-releases";
```

사이트는 GitHub REST API `GET https://api.github.com/repos/{owner}/{repo}/releases/latest`에서 최신 **공개** 릴리스의 `.apk` asset을 찾아 `browser_download_url`로 다운로드 버튼을 연결함.

- 아직 **`jaksim0sec/godseng-alarm-releases` 공개 저장소가 존재하지 않음**. 따라서 다운로드 버튼은 “출시 준비 중”, URL 제거, aria-disabled 처리. 절대 존재하지 않는 APK 다운로드를 가장하지 않음.
- `jaksim0sec/godseng-alarm` 소스 저장소는 **비공개 상태 유지**. 소스 저장소 자체의 Release는 일반 방문자에게 보이지 않으므로 배포 대상으로 사용하지 않음.
- 공개 GitHub Releases 저장소를 생성한 다음 `v1.0.0` 등 태그로 정식 **서명된** APK를 업로드하면 사이트 버튼이 페이지 새로고침 시 자동 활성화.
- 공개 저장소 이름을 다르게 정했다면 `RELEASE_REPO`만 변경해 `main`에 푸시하면 Vercel Git 연동으로 재배포.
- APK 서명 키는 **비공개 GitHub Secrets** 등에 보관. 서명되지 않은 release APK나 debug APK를 정식 설치 파일로 배포하지 말 것. `versionCode`는 업데이트할 때 증가시키고 같은 signing key를 유지.
- GitHub Action으로 공개 저장소에 푸시하는 자동화에는 공개 배포 저장소에 쓰기 권한을 가진 별도 인증이 필요. 현재는 설정하지 않았으며 사용자가 직접 공개 저장소/릴리스 자산과 서명 키를 등록해야 함.

## 검증 범위

- Vercel 연결된 Git 소스 `jaksim0sec/godseng-alarm` + `main`, 프로젝트 `godseng-alarm-download`, 루트 `site`
- 첫 Vercel 빌드 `READY`, 커밋 `3c57335e7d671d23efded5e838f4fdc19ea33157`, 생산 도메인 등록
- 원본 소개 영상 blob SHA `b02be7ee5105951aa007211fe2f73abefc2e0fe9`
- 출처 v3 `갓생알리미_다운로드_v3.html`에서 30초 영상만 외부 MP4로 분리, HTML 가벼워짐
- 리팩터링된 HTML 내 스크립트 블록 2개 모두 문법 검사 통과
- **실제 기기 브라우저 시각 검증, GitHub 릴리스 APK 설치 및 URL 최종 접근 테스트는 미수행**. 배포 READY는 페이지의 모든 UX 동작 성공을 보장하지 않음.

## 유의사항

Vercel SSO 보호는 Preview에만 적용하고 Production 주소는 공개 웹페이지 용도로 설정. Vercel Blob으로 영상 마이그레이션을 선택할 경우 `site/download.html`의 `data-src="./promo.mp4"`를 업로드 완료 후 확보한 실제 Blob URL로 바꾸고, Git에 포함된 MP4는 제거 가능.
