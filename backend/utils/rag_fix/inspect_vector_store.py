import chromadb
import os
import sys

# Add the application root to the Python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from config import settings

def inspect_vector_store():
    """
    Connects to the ChromaDB vector store and prints the metadata of all documents.
    """
    try:
        vector_store_path = settings.vector_store_path
        print(f"Connecting to ChromaDB at: {vector_store_path}")

        # It's a persistent client, so we need the path.
        # The collection name is often managed by LangChain, let's try connecting and listing collections first.
        client = chromadb.PersistentClient(path=vector_store_path)
        
        print("Available collections:")
        collections = client.list_collections()
        for collection in collections:
            print(f"- {collection.name}")

        if not collections:
            print("No collections found in the vector store.")
            return

        # Assuming the collection name is 'langchain' as is common.
        # If not, this will need to be adjusted based on the output above.
        collection_name = "rag_collection"
        collection = client.get_collection(name=collection_name)
        
        print(f"\nInspecting collection: '{collection_name}'")
        
        # Fetch all items from the collection.
        # The include parameter specifies what to return.
        results = collection.get(include=["metadatas"])
        
        if not results or not results["metadatas"]:
            print("No documents found in the collection.")
            return
            
        print(f"Found {len(results['metadatas'])} documents.")
        
        for i, meta in enumerate(results["metadatas"]):
            print(f"\n--- Document {i+1} ---")
            print(meta)

    except Exception as e:
        print(f"An error occurred: {e}")

if __name__ == "__main__":
    inspect_vector_store()