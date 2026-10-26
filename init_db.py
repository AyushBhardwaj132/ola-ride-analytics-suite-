"""
Database Initialization Entrypoint
==================================
Runs the automated ETL pipeline to ingest data/bookings.csv 
into the indexed SQLite analytics database.
"""

from scripts.etl import run_etl

if __name__ == "__main__":
    run_etl()
