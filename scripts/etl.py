"""
ETL Data Pipeline: OLA Ride Operations & Analytics
===================================================
Author: Data Analytics Engineering
Description: Automated ingestion, validation, type-casting, and schema modeling
             for 100k+ ride booking records into SQLite with analytical indexing.
"""

import os
import sqlite3
import time
import pandas as pd
import numpy as np

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV_PATH = os.path.join(BASE_DIR, "data", "bookings.csv")
DB_PATH = os.path.join(BASE_DIR, "data", "ola_analytics.db")

def run_etl():
    print("=" * 65)
    print("INITIATING OLA RIDE ANALYTICS ETL PIPELINE")
    print("=" * 65)
    start_time = time.time()
    
    if not os.path.exists(CSV_PATH):
        raise FileNotFoundError(f"Source file not found at: {CSV_PATH}")
        
    print(f"[1/5] Ingesting raw CSV: {CSV_PATH}")
    df = pd.read_csv(CSV_PATH, low_memory=False)
    raw_rows = len(df)
    print(f"      Loaded {raw_rows:,} raw records across {len(df.columns)} columns.")

    print("[2/5] Cleaning and Normalizing Data...")
    # Drop artifacts or erroneous columns if any
    drop_cols = [c for c in df.columns if 'Unnamed' in c or 'Vehicle Images' in c]
    if drop_cols:
        df = df.drop(columns=drop_cols)
        print(f"   ✓ Dropped unneeded columns: {drop_cols}")
        
    # Replace literal 'null' strings with real None / NaN
    df = df.replace({'null': None, 'NaN': None, np.nan: None})
    
    # Feature Engineering: Clean date, hour of day, and day of week
    df['Date_Only'] = pd.to_datetime(df['Date'], errors='coerce').dt.strftime('%Y-%m-%d')
    df['Hour'] = pd.to_datetime(df['Time'], format='%H:%M:%S', errors='coerce').dt.hour
    df['Day_Name'] = pd.to_datetime(df['Date'], errors='coerce').dt.day_name()
    
    # Cast numerical metrics
    numeric_columns = ['Booking_Value', 'Ride_Distance', 'Driver_Ratings', 'Customer_Rating', 'V_TAT', 'C_TAT']
    for col in numeric_columns:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors='coerce')
            
    print(f"      Features engineered: Date_Only, Hour, Day_Name")
    print(f"      Enforced numeric typing on: {', '.join(numeric_columns)}")

    print(f"[3/5] Loading into SQLite Database: {DB_PATH}")
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    
    # Create main table
    cur.execute("DROP TABLE IF EXISTS bookings")
    df.to_sql('bookings', conn, if_exists='replace', index=False)
    print(f"      Staged {len(df):,} records into table 'bookings'.")

    print("[4/5] Creating High-Performance Analytical Indexes...")
    indexes = [
        ("idx_booking_id", "Booking_ID"),
        ("idx_status", "Booking_Status"),
        ("idx_vehicle", "Vehicle_Type"),
        ("idx_date_only", "Date_Only"),
        ("idx_hour", "Hour"),
        ("idx_customer", "Customer_ID"),
        ("idx_payment", "Payment_Method"),
        ("idx_pickup", "Pickup_Location"),
        ("idx_drop", "Drop_Location")
    ]
    for idx_name, col in indexes:
        cur.execute(f"CREATE INDEX IF NOT EXISTS {idx_name} ON bookings({col})")
    print(f"      Created {len(indexes)} analytical indexes.")

    print("[5/5] Instantiating Analytical SQL Views...")
    views = {
        "vw_successful_bookings": """
            SELECT Booking_ID, Date_Only, Time, Customer_ID, Vehicle_Type, 
                   Pickup_Location, Drop_Location, Ride_Distance, Booking_Value, Payment_Method
            FROM bookings WHERE Booking_Status = 'Success'
        """,
        "vw_vehicle_metrics": """
            SELECT 
                Vehicle_Type,
                COUNT(*) AS total_rides,
                SUM(CASE WHEN Booking_Status = 'Success' THEN 1 ELSE 0 END) AS successful_rides,
                ROUND(AVG(CASE WHEN Ride_Distance > 0 THEN Ride_Distance ELSE NULL END), 2) AS avg_distance_km,
                ROUND(AVG(Driver_Ratings), 2) AS avg_driver_rating,
                ROUND(AVG(Customer_Rating), 2) AS avg_customer_rating,
                ROUND(AVG(V_TAT), 1) AS avg_vehicle_tat_sec,
                ROUND(AVG(C_TAT), 1) AS avg_customer_tat_sec,
                SUM(CASE WHEN Booking_Status = 'Success' THEN Booking_Value ELSE 0 END) AS net_revenue_inr
            FROM bookings GROUP BY Vehicle_Type
        """,
        "vw_customer_cancellations": """
            SELECT Canceled_Rides_by_Customer AS reason, COUNT(*) AS total_occurrences,
                   ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM bookings WHERE Booking_Status = 'Canceled by Customer'), 2) AS pct_share
            FROM bookings WHERE Booking_Status = 'Canceled by Customer' AND Canceled_Rides_by_Customer IS NOT NULL
            GROUP BY Canceled_Rides_by_Customer ORDER BY total_occurrences DESC
        """,
        "vw_driver_cancellations": """
            SELECT Canceled_Rides_by_Driver AS reason, COUNT(*) AS total_occurrences,
                   ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM bookings WHERE Booking_Status = 'Canceled by Driver'), 2) AS pct_share
            FROM bookings WHERE Booking_Status = 'Canceled by Driver' AND Canceled_Rides_by_Driver IS NOT NULL
            GROUP BY Canceled_Rides_by_Driver ORDER BY total_occurrences DESC
        """,
        "vw_top_power_riders": """
            SELECT Customer_ID, COUNT(Booking_ID) AS total_trips,
                   SUM(CASE WHEN Booking_Status = 'Success' THEN 1 ELSE 0 END) AS successful_trips,
                   SUM(Booking_Value) AS total_spend_inr,
                   ROUND(AVG(Customer_Rating), 2) AS avg_rating
            FROM bookings GROUP BY Customer_ID ORDER BY total_trips DESC, total_spend_inr DESC LIMIT 10
        """,
        "vw_revenue_by_payment": """
            SELECT COALESCE(Payment_Method, 'Unspecified / Failed') AS payment_method,
                   COUNT(*) AS transaction_count,
                   SUM(CASE WHEN Booking_Status = 'Success' THEN Booking_Value ELSE 0 END) AS fulfilled_revenue_inr,
                   ROUND(SUM(CASE WHEN Booking_Status = 'Success' THEN Booking_Value ELSE 0 END) * 100.0 / 
                        (SELECT SUM(Booking_Value) FROM bookings WHERE Booking_Status = 'Success'), 2) AS revenue_share_pct
            FROM bookings GROUP BY Payment_Method ORDER BY fulfilled_revenue_inr DESC
        """
    }
    for v_name, v_sql in views.items():
        cur.execute(f"DROP VIEW IF EXISTS {v_name}")
        cur.execute(f"CREATE VIEW {v_name} AS {v_sql}")
    print(f"      Created {len(views)} modular views.")

    conn.commit()

    # Data Quality Verification
    total_db_records = cur.execute("SELECT COUNT(*) FROM bookings").fetchone()[0]
    total_gmv = cur.execute("SELECT SUM(Booking_Value) FROM bookings WHERE Booking_Status = 'Success'").fetchone()[0]
    conn.close()

    elapsed = round(time.time() - start_time, 2)
    print("=" * 65)
    print(f"ETL PIPELINE COMPLETED IN {elapsed} SECONDS")
    print(f"Verified Records: {total_db_records:,}")
    print(f"Verified Fulfilled GMV: INR {total_gmv:,}")
    print("=" * 65)

if __name__ == "__main__":
    run_etl()
