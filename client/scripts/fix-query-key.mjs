/**
 * orval 생성 후 queryKey 할당 문제를 수정하는 스크립트
 * React의 규칙에 따라 hook에서 반환된 객체를 직접 수정할 수 없으므로
 * spread operator를 사용하도록 수정합니다.
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function walkDir(dir, fileList = []) {
  const files = readdirSync(dir);
  files.forEach((file) => {
    const filePath = join(dir, file);
    const stat = statSync(filePath);
    if (stat.isDirectory()) {
      walkDir(filePath, fileList);
    } else if (file.endsWith(".ts")) {
      fileList.push(filePath);
    }
  });
  return fileList;
}

const servicesDir = join(__dirname, "../src/services");
const files = walkDir(servicesDir);

let fixedCount = 0;

for (const file of files) {
  let content = readFileSync(file, "utf8");
  const originalContent = content;

  // query.queryKey = queryOptions.queryKey ; 패턴을 찾아서 수정
  if (content.includes("query.queryKey = queryOptions.queryKey")) {
    // 정규식으로 패턴 매칭 및 수정
    // const query = useQuery(...) as ...; 다음에 빈 라인, query.queryKey = ...; 빈 라인, return query; 패턴
    content = content.replace(
      /(const query = useQuery\(queryOptions, queryClient\) as[^;]+;)\s*\n\s*query\.queryKey = queryOptions\.queryKey\s*;\s*\n\s*return query;/g,
      (match, queryLine) => {
        const indent = queryLine.match(/^(\s*)/)[1];
        const cleanQueryLine = queryLine.replace(/ as[^;]+;/, ";");
        // query 객체에 queryKey가 없으므로 그냥 spread하면 됩니다
        return `${cleanQueryLine}\n${indent}return { queryKey: queryOptions.queryKey, ...query } as UseQueryResult<TData, TError> & { queryKey: DataTag<QueryKey, TData, TError> };`;
      }
    );
  }

  if (content !== originalContent) {
    writeFileSync(file, content, "utf8");
    console.log(`Fixed: ${file}`);
    fixedCount++;
  }
}

console.log(`\nFixed ${fixedCount} file(s)`);
