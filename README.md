# EnglishAI - Ung dung web hoc ky nang tieng Anh thich ung tich hop AI

## Chay du an

```bash
docker compose up -d                      # CSDL PostgreSQL
cd server && npm install
cp .env.example .env                      # dien GEMINI_API_KEY
npx prisma migrate dev --name init
npm run dev                               # http://localhost:4000
cd ../client && npm install && npm run dev  # http://localhost:5173
npx.cmd prisma studio #mo prismastudio
npm.cmd run db:seed  #nạp dữ liệu mẫu ban đầu vào database
npm.cmd run eval:ai -- --dry-run #đánh giá tin cậy AI dựa vào bài thật
npx.cmd vitest run --no-file-parallelism src/ #test file khong dinh song song
```
