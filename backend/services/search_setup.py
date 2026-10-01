"""Crea (si no existe) el data store de Vertex AI Search donde se indexan las lecturas de las tareas.

Idempotente: si el data store ya existe solo lo reporta. Uso:
    uv run python -m services.search_setup
"""
import json
import os

from dotenv import load_dotenv
from google.api_core.exceptions import AlreadyExists, NotFound
from google.cloud import discoveryengine_v1 as discoveryengine

load_dotenv()

# assignment_id debe ser indexable para poder filtrar cada búsqueda por su tarea
SCHEMA = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "properties": {
        "assignment_id": {"type": "string", "indexable": True, "retrievable": True},
        "file_name": {"type": "string", "retrievable": True},
        "title": {"type": "string", "retrievable": True, "keyPropertyMapping": "title"},
    },
}


def main() -> None:
    project = os.environ["GOOGLE_CLOUD_PROJECT"]
    location = os.getenv("DATA_STORE_REGION", "global")
    collection = os.getenv("DATA_STORE_COLLECTION", "default_collection")
    data_store_id = os.getenv("DATA_STORE_ID", "essay-tutor-datastore")
    parent = f"projects/{project}/locations/{location}/collections/{collection}"
    name = f"{parent}/dataStores/{data_store_id}"

    client = discoveryengine.DataStoreServiceClient()
    try:
        existing = client.get_data_store(name=name)
        print(f"El data store ya existe: {existing.name}")
        return
    except NotFound:
        pass

    data_store = discoveryengine.DataStore(
        display_name="Sharon - lecturas de las tareas",
        industry_vertical=discoveryengine.IndustryVertical.GENERIC,
        solution_types=[discoveryengine.SolutionType.SOLUTION_TYPE_SEARCH],
        content_config=discoveryengine.DataStore.ContentConfig.CONTENT_REQUIRED,
        document_processing_config=discoveryengine.DocumentProcessingConfig(
            default_parsing_config=discoveryengine.DocumentProcessingConfig.ParsingConfig(
                layout_parsing_config=discoveryengine.DocumentProcessingConfig.ParsingConfig.LayoutParsingConfig()
            ),
            chunking_config=discoveryengine.DocumentProcessingConfig.ChunkingConfig(
                layout_based_chunking_config=discoveryengine.DocumentProcessingConfig.ChunkingConfig.LayoutBasedChunkingConfig(
                    chunk_size=400,
                    include_ancestor_headings=True,
                )
            ),
        ),
        starting_schema=discoveryengine.Schema(json_schema=json.dumps(SCHEMA)),
    )
    try:
        operation = client.create_data_store(
            parent=parent, data_store=data_store, data_store_id=data_store_id
        )
        created = operation.result(timeout=600)
        print(f"Data store creado: {created.name}")
    except AlreadyExists:
        print(f"El data store ya existe: {name}")


if __name__ == "__main__":
    main()
