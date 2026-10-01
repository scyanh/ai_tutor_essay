# Despliegue del frontend de Sharon en Firebase Hosting (sitio tlanova-sharon del proyecto tlanova).
# El build usa .env.production: el navegador llama directo a sharon-api en Cloud Run.

.PHONY: build deploy

build:
	npm ci
	npm run build

deploy: build
	firebase deploy --only hosting --project tlanova
