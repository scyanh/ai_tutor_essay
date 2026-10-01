# Despliegue de Sharon API en Cloud Run.
#
# Es el comando que genera `agents-cli deploy --dry-run`, con tres ajustes:
#   - No copia el .env local (agents-cli lo propaga completo, incluida la contraseña de la DB);
#     los secretos salen de Secret Manager.
#   - Conecta la instancia compartida tlanovadb, sin modificarla, y limita a 1 instancia
#     para no acaparar conexiones de los otros proyectos.
#   - Es público (--allow-unauthenticated): el navegador llama a /api con su propio JWT y
#     las rutas nativas de ADK quedan bloqueadas en Cloud Run (essay_tutor/fast_api_app.py).

PROJECT := tlanova
REGION := us-central1
SERVICE := sharon-api
SA := sharon-api-run@$(PROJECT).iam.gserviceaccount.com
CLOUDSQL := tlanova:us-central1:tlanovadb
VERSION := $(shell sed -n 's/^version = "\(.*\)"/\1/p' pyproject.toml)
# Frontend en Firebase Hosting (frontend/firebase.json): el navegador llama a la API desde estos orígenes
ALLOW_ORIGINS := https://tlanova-sharon.web.app,https://tlanova-sharon.firebaseapp.com

ENV_VARS := ^\#\#^GOOGLE_CLOUD_PROJECT=$(PROJECT)\#\#GOOGLE_GENAI_USE_VERTEXAI=True\#\#GOOGLE_CLOUD_LOCATION=global\#\#MODEL_NAME=gemini-3.8-flash\#\#INSTANCE_CONNECTION_NAME=$(CLOUDSQL)\#\#DB_USER=tlanovauser\#\#DB_NAME=sharon_education\#\#DB_POOL_SIZE=3\#\#DB_MAX_OVERFLOW=2\#\#GCS_BUCKET_NAME=sharon_storage\#\#DATA_STORE_REGION=global\#\#DATA_STORE_COLLECTION=default_collection\#\#DATA_STORE_ID=essay-tutor-datastore\#\#LOG_LEVEL=INFO\#\#ADK_CAPTURE_MESSAGE_CONTENT_IN_SPANS=false\#\#AGENT_VERSION=$(VERSION)\#\#ALLOW_ORIGINS=$(ALLOW_ORIGINS)

.PHONY: test deploy url logs

test:
	scripts/test_postgres.sh -q tests/test_api.py tests/test_groups.py tests/test_documents.py tests/test_db.py tests/test_agent.py tests/unit

deploy: test
	gcloud run deploy $(SERVICE) --source . --project $(PROJECT) --region $(REGION) \
		--service-account $(SA) --allow-unauthenticated \
		--memory 2Gi --cpu 1 --min-instances 0 --max-instances 1 --concurrency 8 \
		--no-cpu-throttling --timeout 600 \
		--add-cloudsql-instances $(CLOUDSQL) \
		--update-env-vars "$(ENV_VARS)" \
		--update-secrets "DB_PASS=sharon-db-password:latest,JWT_SECRET=sharon-jwt-secret:latest" \
		--update-labels "created-by=agents-cli,app=sharon" \
		--quiet

url:
	@gcloud run services describe $(SERVICE) --project $(PROJECT) --region $(REGION) --format='value(status.url)'

logs:
	gcloud logging read 'resource.type=cloud_run_revision AND resource.labels.service_name=$(SERVICE)' \
		--project $(PROJECT) --limit 50 --format='table(timestamp,severity,textPayload)'
