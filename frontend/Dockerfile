# RS Dataset Factory - Frontend Dockerfile

# Build stage
FROM node:20-alpine as build

WORKDIR /app

# 複製 package 文件
COPY package*.json ./

# 安裝依賴
RUN npm ci

# 複製源代碼
COPY . .

# 構建
RUN npm run build

# Production stage
FROM nginx:alpine

# 複製構建產物
COPY --from=build /app/dist /usr/share/nginx/html

# 複製 nginx 配置
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
