# Use a stable Nginx image to serve our static assets
FROM nginx:stable-alpine

# The build process from cloudbuild.yaml will create a 'dist' directory.
# We just need to copy it into the directory Nginx serves from.
COPY dist/ /usr/share/nginx/html

# Expose port 80 and start Nginx
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
