import os
import shutil
import glob

# --- Configuration ---
# This path now points to the parent directory to clear everything inside it.
VECTOR_STORE_PARENT_DIR = "storage/vector_store"
PDFS_DIR = "storage/documents/pdfs"
CACHE_DIR = "utils/__pycache__"

def clear_vector_store():
    """Deletes all contents of the vector store directory."""
    print(f"Cleaning all contents from: {VECTOR_STORE_PARENT_DIR}")
    if os.path.exists(VECTOR_STORE_PARENT_DIR):
        for item_name in os.listdir(VECTOR_STORE_PARENT_DIR):
            item_path = os.path.join(VECTOR_STORE_PARENT_DIR, item_name)
            try:
                if os.path.isdir(item_path):
                    shutil.rmtree(item_path)
                    print(f"Deleted directory: {item_path}")
                elif os.path.isfile(item_path):
                    os.remove(item_path)
                    print(f"Deleted file: {item_path}")
            except Exception as e:
                print(f"Error deleting {item_path}: {e}")
        print("Vector store directory fully cleaned.")
    else:
        print("Vector store directory not found, skipping.")

def clear_pdfs_directory():
    """Deletes all PDF files from the specified directory."""
    print(f"Cleaning PDFs directory at: {PDFS_DIR}")
    if os.path.exists(PDFS_DIR):
        file_list = glob.glob(os.path.join(PDFS_DIR, '*'))
        for file_path in file_list:
            if os.path.isfile(file_path):
                os.remove(file_path)
                print(f"Deleted: {file_path}")
        print("PDFs directory cleaned.")
    else:
        print("PDFs directory not found, skipping.")

def clear_cache():
    """Deletes the __pycache__ directory."""
    print(f"Cleaning cache directory at: {CACHE_DIR}")
    if os.path.exists(CACHE_DIR):
        shutil.rmtree(CACHE_DIR)
        print("Cache directory deleted.")
    else:
        print("Cache directory not found, skipping.")

def total_cleanup():
    """
    Performs a complete cleanup of the vector store, PDFs, and cache.
    """
    print("--- Starting Total Cleanup ---")
    clear_vector_store()
    clear_pdfs_directory()
    clear_cache()
    print("--- Total Cleanup Finished ---")

if __name__ == "__main__":
    total_cleanup()