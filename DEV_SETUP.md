# 개발 환경 셋업 (집 ↔ 회사)

집과 회사를 오가며 개발할 때, 코드는 git으로 동기화되지만
**환경설정(.env)과 DB 데이터는 동기화되지 않습니다.** 아래 절차를 따르세요.

## 새 머신 최초 1회 세팅

```bash
# 1. 클론
git clone https://github.com/louis-25/dongchat.git
cd dongchat

# 2. Node 버전 맞추기 (nvm 사용 시)
nvm use            # .nvmrc => 20

# 3. 의존성 설치
cd server && pnpm install && cd ../client && pnpm install && cd ..

# 4. 로컬 MySQL 띄우기 (Docker)
docker compose up -d

# 5. 환경설정 파일 만들기 (.example 복사 후 값 채우기)
cp server/.env.example server/.env
cp client/.env.local.example client/.env.local
#    => 시크릿 값(NEXTAUTH_SECRET, VAPID_*, KAKAO_*)은 비밀번호 매니저나
#       수동 복사로 채웁니다. 두 파일의 *NEXTAUTH_SECRET 값은 반드시 동일해야 합니다.
```

## 매일 작업 시작할 때

```bash
git pull
pnpm install          # server, client 각각 (lockfile 변경 대비)
docker compose up -d  # MySQL 시작
```

## 작업 끝내고 자리 뜰 때 (★ 중요)

```bash
git add -A && git commit -m "wip: 작업 내용" && git push
```
> 커밋이 지저분해도 괜찮습니다. "안 잃어버리는 것"이 우선이고,
> 정리는 나중에 `git rebase -i`로 하면 됩니다.

## 실행

```bash
# 터미널 1
cd server && pnpm start:dev      # http://localhost:4000  (Swagger: /api-docs)
# 터미널 2
cd client && pnpm dev            # http://localhost:3000
```

## 참고

- **DB 포트는 3307입니다.** 머신에 이미 네이티브 MySQL(3306)이 있어도 충돌하지 않도록
  Docker 컨테이너를 호스트 3307에 매핑했습니다. `server/.env`의 `DB_PORT=3307`을 유지하세요.
  (네이티브 MySQL을 그대로 쓰려면 `DB_PORT=3306`으로 바꾸고 Docker는 안 띄우면 됩니다.)
- **DB 데이터는 머신마다 따로입니다.** 집에서 만든 계정은 회사에 없습니다 (테스트 계정 재생성).
  나중에 데이터 연속성이 필요하면 `server/.env`의 DB_* 값만 무료 클라우드 MySQL
  (예: TiDB Cloud Serverless — MySQL 호환·무료)로 바꾸면 양쪽에서 같은 데이터를 씁니다.
- `synchronize: true` 라서 엔티티 변경 시 스키마는 자동 반영됩니다(운영 전환 시 마이그레이션 권장).
- DB를 깨끗이 초기화하려면: `docker compose down -v && docker compose up -d`
