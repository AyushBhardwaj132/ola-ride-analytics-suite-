import sqlite3
import os
import time
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

app = Flask(__name__, static_folder="public", static_url_path="")
CORS(app)

DB_PATH = os.path.join("data", "ola_analytics.db") if os.path.exists(os.path.join("data", "ola_analytics.db")) else "ola_analytics.db"

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def build_filter_clause(args):
    conditions = []
    params = []
    
    status = args.get("status")
    if status and status != "All":
        conditions.append("Booking_Status = ?")
        params.append(status)
        
    vehicle = args.get("vehicle")
    if vehicle and vehicle != "All":
        conditions.append("Vehicle_Type = ?")
        params.append(vehicle)
        
    payment = args.get("payment")
    if payment and payment != "All":
        conditions.append("Payment_Method = ?")
        params.append(payment)
        
    date_start = args.get("date_start")
    if date_start:
        conditions.append("Date_Only >= ?")
        params.append(date_start)
        
    date_end = args.get("date_end")
    if date_end:
        conditions.append("Date_Only <= ?")
        params.append(date_end)
        
    where_sql = ("WHERE " + " AND ".join(conditions)) if conditions else ""
    return where_sql, params

@app.route("/")
def index():
    return send_from_directory("public", "index.html")

@app.route("/api/filter_options", methods=["GET"])
def filter_options():
    conn = get_db()
    cur = conn.cursor()
    
    vehicles = [r[0] for r in cur.execute("SELECT DISTINCT Vehicle_Type FROM bookings ORDER BY Vehicle_Type").fetchall() if r[0]]
    statuses = [r[0] for r in cur.execute("SELECT DISTINCT Booking_Status FROM bookings ORDER BY Booking_Status").fetchall() if r[0]]
    payments = [r[0] for r in cur.execute("SELECT DISTINCT Payment_Method FROM bookings WHERE Payment_Method IS NOT NULL ORDER BY Payment_Method").fetchall()]
    dates = cur.execute("SELECT MIN(Date_Only), MAX(Date_Only) FROM bookings").fetchone()
    
    conn.close()
    return jsonify({
        "vehicles": ["All"] + vehicles,
        "statuses": ["All"] + statuses,
        "payments": ["All"] + payments,
        "min_date": dates[0],
        "max_date": dates[1]
    })

@app.route("/api/summary", methods=["GET"])
def summary():
    where_sql, params = build_filter_clause(request.args)
    conn = get_db()
    cur = conn.cursor()
    
    query = f"""
        SELECT 
            COUNT(*) as total_bookings,
            SUM(CASE WHEN Booking_Status = 'Success' THEN 1 ELSE 0 END) as successful_bookings,
            SUM(CASE WHEN Booking_Status = 'Canceled by Driver' THEN 1 ELSE 0 END) as canceled_by_driver,
            SUM(CASE WHEN Booking_Status = 'Canceled by Customer' THEN 1 ELSE 0 END) as canceled_by_customer,
            SUM(CASE WHEN Booking_Status = 'Driver Not Found' THEN 1 ELSE 0 END) as driver_not_found,
            SUM(CASE WHEN Incomplete_Rides = 'Yes' THEN 1 ELSE 0 END) as incomplete_rides,
            SUM(Booking_Value) as total_booking_value,
            SUM(CASE WHEN Booking_Status = 'Success' THEN Booking_Value ELSE 0 END) as successful_revenue,
            AVG(CASE WHEN Booking_Status = 'Success' THEN Booking_Value ELSE NULL END) as avg_fare,
            AVG(CASE WHEN Ride_Distance > 0 THEN Ride_Distance ELSE NULL END) as avg_distance,
            AVG(Driver_Ratings) as avg_driver_rating,
            AVG(Customer_Rating) as avg_customer_rating,
            AVG(V_TAT) as avg_vtat,
            AVG(C_TAT) as avg_ctat
        FROM bookings
        {where_sql}
    """
    row = cur.execute(query, params).fetchone()
    conn.close()
    
    total = row["total_bookings"] or 0
    success = row["successful_bookings"] or 0
    driver_cancel = row["canceled_by_driver"] or 0
    cust_cancel = row["canceled_by_customer"] or 0
    not_found = row["driver_not_found"] or 0
    
    return jsonify({
        "total_bookings": total,
        "successful_bookings": success,
        "success_rate": round((success / total * 100), 2) if total else 0,
        "canceled_by_driver": driver_cancel,
        "driver_cancel_rate": round((driver_cancel / total * 100), 2) if total else 0,
        "canceled_by_customer": cust_cancel,
        "cust_cancel_rate": round((cust_cancel / total * 100), 2) if total else 0,
        "driver_not_found": not_found,
        "not_found_rate": round((not_found / total * 100), 2) if total else 0,
        "incomplete_rides": row["incomplete_rides"] or 0,
        "total_booking_value": row["total_booking_value"] or 0,
        "successful_revenue": row["successful_revenue"] or 0,
        "avg_fare": round(row["avg_fare"] or 0, 1),
        "avg_distance": round(row["avg_distance"] or 0, 2),
        "avg_driver_rating": round(row["avg_driver_rating"] or 0, 2),
        "avg_customer_rating": round(row["avg_customer_rating"] or 0, 2),
        "avg_vtat": round(row["avg_vtat"] or 0, 1),
        "avg_ctat": round(row["avg_ctat"] or 0, 1)
    })

@app.route("/api/trends", methods=["GET"])
def trends():
    where_sql, params = build_filter_clause(request.args)
    conn = get_db()
    cur = conn.cursor()
    
    query = f"""
        SELECT 
            Date_Only as date,
            COUNT(*) as total_rides,
            SUM(CASE WHEN Booking_Status = 'Success' THEN 1 ELSE 0 END) as success,
            SUM(CASE WHEN Booking_Status = 'Canceled by Driver' THEN 1 ELSE 0 END) as driver_cancel,
            SUM(CASE WHEN Booking_Status = 'Canceled by Customer' THEN 1 ELSE 0 END) as customer_cancel,
            SUM(CASE WHEN Booking_Status = 'Driver Not Found' THEN 1 ELSE 0 END) as driver_not_found,
            SUM(CASE WHEN Booking_Status = 'Success' THEN Booking_Value ELSE 0 END) as revenue
        FROM bookings
        {where_sql}
        GROUP BY Date_Only
        ORDER BY Date_Only ASC
    """
    rows = cur.execute(query, params).fetchall()
    conn.close()
    
    return jsonify([dict(r) for r in rows])

@app.route("/api/hourly", methods=["GET"])
def hourly():
    where_sql, params = build_filter_clause(request.args)
    conn = get_db()
    cur = conn.cursor()
    
    query = f"""
        SELECT 
            Hour as hour,
            COUNT(*) as total_rides,
            SUM(CASE WHEN Booking_Status = 'Success' THEN 1 ELSE 0 END) as success,
            SUM(CASE WHEN Booking_Status LIKE 'Canceled%' THEN 1 ELSE 0 END) as canceled,
            SUM(CASE WHEN Booking_Status = 'Driver Not Found' THEN 1 ELSE 0 END) as driver_not_found
        FROM bookings
        {where_sql}
        GROUP BY Hour
        ORDER BY Hour ASC
    """
    rows = cur.execute(query, params).fetchall()
    conn.close()
    
    return jsonify([dict(r) for r in rows])

@app.route("/api/vehicles", methods=["GET"])
def vehicles():
    where_sql, params = build_filter_clause(request.args)
    conn = get_db()
    cur = conn.cursor()
    
    query = f"""
        SELECT 
            Vehicle_Type as vehicle,
            COUNT(*) as total_rides,
            SUM(CASE WHEN Booking_Status = 'Success' THEN 1 ELSE 0 END) as successful_rides,
            SUM(CASE WHEN Booking_Status = 'Success' THEN Booking_Value ELSE 0 END) as total_revenue,
            ROUND(AVG(CASE WHEN Ride_Distance > 0 THEN Ride_Distance ELSE NULL END), 2) as avg_distance,
            ROUND(AVG(Driver_Ratings), 2) as avg_driver_rating,
            ROUND(AVG(Customer_Rating), 2) as avg_customer_rating,
            ROUND(AVG(V_TAT), 1) as avg_vtat,
            ROUND(AVG(C_TAT), 1) as avg_ctat
        FROM bookings
        {where_sql}
        GROUP BY Vehicle_Type
        ORDER BY total_rides DESC
    """
    rows = cur.execute(query, params).fetchall()
    conn.close()
    
    return jsonify([dict(r) for r in rows])

@app.route("/api/cancellations", methods=["GET"])
def cancellations():
    where_sql, params = build_filter_clause(request.args)
    conn = get_db()
    cur = conn.cursor()
    
    # Customer reasons
    cust_query = f"""
        SELECT Canceled_Rides_by_Customer as reason, COUNT(*) as count
        FROM bookings
        {where_sql} AND Canceled_Rides_by_Customer IS NOT NULL
        GROUP BY Canceled_Rides_by_Customer
        ORDER BY count DESC
    """ if where_sql else """
        SELECT Canceled_Rides_by_Customer as reason, COUNT(*) as count
        FROM bookings
        WHERE Canceled_Rides_by_Customer IS NOT NULL
        GROUP BY Canceled_Rides_by_Customer
        ORDER BY count DESC
    """
    cust_rows = cur.execute(cust_query, params).fetchall()
    
    # Driver reasons
    driver_query = f"""
        SELECT Canceled_Rides_by_Driver as reason, COUNT(*) as count
        FROM bookings
        {where_sql} AND Canceled_Rides_by_Driver IS NOT NULL
        GROUP BY Canceled_Rides_by_Driver
        ORDER BY count DESC
    """ if where_sql else """
        SELECT Canceled_Rides_by_Driver as reason, COUNT(*) as count
        FROM bookings
        WHERE Canceled_Rides_by_Driver IS NOT NULL
        GROUP BY Canceled_Rides_by_Driver
        ORDER BY count DESC
    """
    driver_rows = cur.execute(driver_query, params).fetchall()
    
    # Incomplete reasons
    incomp_query = f"""
        SELECT Incomplete_Rides_Reason as reason, COUNT(*) as count
        FROM bookings
        {where_sql} AND Incomplete_Rides = 'Yes' AND Incomplete_Rides_Reason IS NOT NULL
        GROUP BY Incomplete_Rides_Reason
        ORDER BY count DESC
    """ if where_sql else """
        SELECT Incomplete_Rides_Reason as reason, COUNT(*) as count
        FROM bookings
        WHERE Incomplete_Rides = 'Yes' AND Incomplete_Rides_Reason IS NOT NULL
        GROUP BY Incomplete_Rides_Reason
        ORDER BY count DESC
    """
    incomp_rows = cur.execute(incomp_query, params).fetchall()
    
    conn.close()
    return jsonify({
        "customer_reasons": [dict(r) for r in cust_rows],
        "driver_reasons": [dict(r) for r in driver_rows],
        "incomplete_reasons": [dict(r) for r in incomp_rows]
    })

@app.route("/api/payments", methods=["GET"])
def payments():
    where_sql, params = build_filter_clause(request.args)
    conn = get_db()
    cur = conn.cursor()
    
    query = f"""
        SELECT 
            COALESCE(Payment_Method, 'Unspecified / Failed') as method,
            COUNT(*) as rides,
            SUM(Booking_Value) as total_value,
            SUM(CASE WHEN Booking_Status = 'Success' THEN Booking_Value ELSE 0 END) as successful_value
        FROM bookings
        {where_sql}
        GROUP BY Payment_Method
        ORDER BY total_value DESC
    """
    rows = cur.execute(query, params).fetchall()
    conn.close()
    
    return jsonify([dict(r) for r in rows])

@app.route("/api/top_customers", methods=["GET"])
def top_customers():
    where_sql, params = build_filter_clause(request.args)
    conn = get_db()
    cur = conn.cursor()
    
    query = f"""
        SELECT 
            Customer_ID as customer_id,
            COUNT(Booking_ID) as total_rides,
            SUM(CASE WHEN Booking_Status = 'Success' THEN 1 ELSE 0 END) as successful_rides,
            SUM(Booking_Value) as total_spend,
            ROUND(AVG(Customer_Rating), 2) as avg_rating
        FROM bookings
        {where_sql}
        GROUP BY Customer_ID
        ORDER BY total_rides DESC, total_spend DESC
        LIMIT 10
    """
    rows = cur.execute(query, params).fetchall()
    conn.close()
    return jsonify([dict(r) for r in rows])

@app.route("/api/locations", methods=["GET"])
def locations():
    where_sql, params = build_filter_clause(request.args)
    conn = get_db()
    cur = conn.cursor()
    
    pickups = cur.execute(f"""
        SELECT Pickup_Location as location, COUNT(*) as rides, 
               SUM(CASE WHEN Booking_Status = 'Success' THEN 1 ELSE 0 END) as successful_rides,
               SUM(Booking_Value) as total_value
        FROM bookings
        {where_sql}
        GROUP BY Pickup_Location
        ORDER BY rides DESC
        LIMIT 10
    """, params).fetchall()
    
    drops = cur.execute(f"""
        SELECT Drop_Location as location, COUNT(*) as rides,
               SUM(CASE WHEN Booking_Status = 'Success' THEN 1 ELSE 0 END) as successful_rides,
               SUM(Booking_Value) as total_value
        FROM bookings
        {where_sql}
        GROUP BY Drop_Location
        ORDER BY rides DESC
        LIMIT 10
    """, params).fetchall()
    
    conn.close()
    return jsonify({
        "top_pickups": [dict(r) for r in pickups],
        "top_drops": [dict(r) for r in drops]
    })

@app.route("/api/bookings", methods=["GET"])
def bookings():
    page = int(request.args.get("page", 1))
    page_size = min(int(request.args.get("page_size", 25)), 100)
    offset = (page - 1) * page_size
    search = request.args.get("search", "").strip()
    
    where_sql, params = build_filter_clause(request.args)
    
    if search:
        search_clause = "(Booking_ID LIKE ? OR Customer_ID LIKE ? OR Pickup_Location LIKE ? OR Drop_Location LIKE ?)"
        search_val = f"%{search}%"
        search_params = [search_val, search_val, search_val, search_val]
        if where_sql:
            where_sql += f" AND {search_clause}"
            params.extend(search_params)
        else:
            where_sql = f"WHERE {search_clause}"
            params = search_params
            
    conn = get_db()
    cur = conn.cursor()
    
    count_query = f"SELECT COUNT(*) FROM bookings {where_sql}"
    total_records = cur.execute(count_query, params).fetchone()[0]
    
    query = f"""
        SELECT 
            Booking_ID, Date_Only, Time, Booking_Status, Customer_ID,
            Vehicle_Type, Pickup_Location, Drop_Location, Booking_Value,
            Payment_Method, Ride_Distance, Driver_Ratings, Customer_Rating,
            Incomplete_Rides, Incomplete_Rides_Reason
        FROM bookings
        {where_sql}
        ORDER BY Date_Only DESC, Time DESC
        LIMIT ? OFFSET ?
    """
    rows = cur.execute(query, params + [page_size, offset]).fetchall()
    conn.close()
    
    return jsonify({
        "page": page,
        "page_size": page_size,
        "total_records": total_records,
        "total_pages": (total_records + page_size - 1) // page_size,
        "data": [dict(r) for r in rows]
    })

SQL_PRESETS = [
    {
        "id": 1,
        "title": "1. Retrieve all successful bookings",
        "description": "Filters the bookings table for rides with status 'Success'.",
        "query": "SELECT Booking_ID, Date_Only, Customer_ID, Vehicle_Type, Pickup_Location, Drop_Location, Ride_Distance, Booking_Value, Payment_Method FROM bookings WHERE Booking_Status = 'Success' LIMIT 50;"
    },
    {
        "id": 2,
        "title": "2. Average ride distance for each vehicle type",
        "description": "Calculates the mean distance (km) covered across every vehicle category.",
        "query": "SELECT Vehicle_Type, ROUND(AVG(Ride_Distance), 2) AS avg_ride_distance_km, COUNT(*) AS total_rides FROM bookings GROUP BY Vehicle_Type ORDER BY avg_ride_distance_km DESC;"
    },
    {
        "id": 3,
        "title": "3. Total cancelled rides by customers",
        "description": "Counts customer-side cancellations and calculates percentage share of overall rides.",
        "query": "SELECT Booking_Status, COUNT(*) AS cancelled_rides_count, ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM bookings), 2) AS percentage_of_all_rides FROM bookings WHERE Booking_Status = 'Canceled by Customer';"
    },
    {
        "id": 4,
        "title": "4. Top 5 customers by ride volume",
        "description": "Identifies the most frequent riders along with their total spend and average customer rating.",
        "query": "SELECT Customer_ID, COUNT(Booking_ID) AS total_rides, SUM(Booking_Value) AS total_spent_inr, ROUND(AVG(Customer_Rating), 2) AS avg_rating FROM bookings GROUP BY Customer_ID ORDER BY total_rides DESC LIMIT 5;"
    },
    {
        "id": 5,
        "title": "5. Driver cancellations due to personal & car issues",
        "description": "Measures rides aborted by drivers specifically citing vehicle or personal reasons.",
        "query": "SELECT Canceled_Rides_by_Driver AS reason, COUNT(*) AS cancel_count, ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM bookings WHERE Booking_Status = 'Canceled by Driver'), 2) AS pct_of_driver_cancels FROM bookings WHERE Canceled_Rides_by_Driver = 'Personal & Car related issue';"
    },
    {
        "id": 6,
        "title": "6. Max & Min driver ratings for Prime Sedan",
        "description": "Computes rating extremes and average quality score for Prime Sedan drivers.",
        "query": "SELECT Vehicle_Type, MAX(Driver_Ratings) AS max_rating, MIN(Driver_Ratings) AS min_rating, ROUND(AVG(Driver_Ratings), 2) AS avg_rating, COUNT(*) AS rated_trips FROM bookings WHERE Vehicle_Type = 'Prime Sedan' AND Driver_Ratings IS NOT NULL;"
    },
    {
        "id": 7,
        "title": "7. Retrieve rides paid via UPI",
        "description": "Lists ride transactions settled through Unified Payments Interface (UPI).",
        "query": "SELECT Booking_ID, Date_Only, Customer_ID, Vehicle_Type, Booking_Value, Ride_Distance, Pickup_Location, Drop_Location FROM bookings WHERE Payment_Method = 'UPI' LIMIT 50;"
    },
    {
        "id": 8,
        "title": "8. Average customer rating per vehicle type",
        "description": "Evaluates customer satisfaction index across different vehicle segments.",
        "query": "SELECT Vehicle_Type, ROUND(AVG(Customer_Rating), 2) AS avg_customer_rating, COUNT(*) AS sample_size FROM bookings WHERE Customer_Rating IS NOT NULL GROUP BY Vehicle_Type ORDER BY avg_customer_rating DESC;"
    },
    {
        "id": 9,
        "title": "9. Total booking value of completed rides",
        "description": "Calculates Gross Merchandise Value (GMV) of successfully fulfilled bookings.",
        "query": "SELECT COUNT(*) AS total_successful_rides, SUM(Booking_Value) AS total_successful_revenue_inr, ROUND(AVG(Booking_Value), 2) AS avg_ticket_size_inr FROM bookings WHERE Booking_Status = 'Success';"
    },
    {
        "id": 10,
        "title": "10. Incomplete rides along with reason",
        "description": "Lists incomplete journeys and reasons logged in the operations database.",
        "query": "SELECT Booking_ID, Customer_ID, Vehicle_Type, Incomplete_Rides_Reason, Booking_Value, Ride_Distance, Pickup_Location, Drop_Location FROM bookings WHERE Incomplete_Rides = 'Yes';"
    }
]

@app.route("/api/sql_presets", methods=["GET"])
def sql_presets():
    return jsonify(SQL_PRESETS)

@app.route("/api/execute_sql", methods=["POST"])
def execute_sql():
    data = request.get_json() or {}
    raw_query = data.get("query", "").strip()
    
    if not raw_query:
        return jsonify({"error": "Query cannot be empty"}), 400
        
    # Security safeguard: allow only SELECT queries
    first_word = raw_query.strip().split()[0].upper()
    if first_word not in ["SELECT", "WITH", "EXPLAIN"]:
        return jsonify({"error": "Only SELECT, WITH, or EXPLAIN queries are permitted in this analytics explorer"}), 400

    conn = get_db()
    cur = conn.cursor()
    t0 = time.time()
    
    try:
        cur.execute(raw_query)
        col_names = [desc[0] for desc in cur.description] if cur.description else []
        rows = cur.fetchmany(500) # Cap display at 500 rows for smooth UI
        duration_ms = round((time.time() - t0) * 1000, 2)
        
        result_rows = []
        for r in rows:
            result_rows.append([r[col] for col in col_names])
            
        conn.close()
        return jsonify({
            "columns": col_names,
            "rows": result_rows,
            "row_count": len(result_rows),
            "duration_ms": duration_ms,
            "error": None
        })
    except Exception as e:
        conn.close()
        return jsonify({
            "columns": [],
            "rows": [],
            "row_count": 0,
            "duration_ms": round((time.time() - t0) * 1000, 2),
            "error": str(e)
        }), 400

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    print(f"Starting OLA Analytics Server on http://localhost:{port}...")
    app.run(host="0.0.0.0", port=port, debug=False)
