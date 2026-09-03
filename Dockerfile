FROM nginx:alpine
COPY index.html /usr/share/nginx/html/index.html
COPY assets/ /usr/share/nginx/html/assets/
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
ENV API_URL=http://api:4000
EXPOSE 10000
CMD ["nginx", "-g", "daemon off;"]
