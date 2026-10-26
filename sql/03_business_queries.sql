-- ====================================================================
-- OLA MOBILITY ANALYTICS - BUSINESS ANALYTICAL QUERIES
-- ====================================================================
-- Project: OLA Ride Operations & Business Intelligence
-- Dataset: Bengaluru July 2024 (103,024 Bookings)
-- Engine: SQLite / MySQL 8.0+ Compatible
-- ====================================================================

-- --------------------------------------------------------------------
-- QUERY 1: Retrieve All Successful Bookings
-- Business Context: Extract fulfilled transactions for revenue recognition
--                   and customer journey analysis.
-- --------------------------------------------------------------------
SELECT 
    Booking_ID,
    Date_Only,
    Time,
    Customer_ID,
    Vehicle_Type,
    Pickup_Location,
    Drop_Location,
    Ride_Distance,
    Booking_Value,
    Payment_Method
FROM bookings 
WHERE Booking_Status = 'Success';


-- --------------------------------------------------------------------
-- QUERY 2: Average Ride Distance for Each Vehicle Type
-- Business Context: Evaluate operational trip length profiles across
--                   micromobility (eBike, Auto) vs premium four-wheelers.
-- --------------------------------------------------------------------
SELECT 
    Vehicle_Type,
    ROUND(AVG(Ride_Distance), 2) AS avg_ride_distance_km,
    ROUND(MIN(Ride_Distance), 2) AS min_distance_km,
    ROUND(MAX(Ride_Distance), 2) AS max_distance_km,
    COUNT(*) AS total_sample_size
FROM bookings 
GROUP BY Vehicle_Type
ORDER BY avg_ride_distance_km DESC;


-- --------------------------------------------------------------------
-- QUERY 3: Total Number & Share of Cancelled Rides by Customers
-- Business Context: Measure customer-side friction and abandonment rate.
-- --------------------------------------------------------------------
SELECT 
    Booking_Status,
    COUNT(*) AS cancelled_rides_count,
    ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM bookings), 2) AS pct_of_total_bookings
FROM bookings 
WHERE Booking_Status = 'Canceled by Customer';


-- --------------------------------------------------------------------
-- QUERY 4: Top 5 Power Customers by Booking Frequency & Total Spend
-- Business Context: Identify VIP accounts for loyalty retention programs.
-- --------------------------------------------------------------------
SELECT 
    Customer_ID,
    COUNT(Booking_ID) AS total_rides_booked,
    SUM(CASE WHEN Booking_Status = 'Success' THEN 1 ELSE 0 END) AS successful_rides,
    SUM(Booking_Value) AS total_expenditure_inr,
    ROUND(AVG(Customer_Rating), 2) AS avg_customer_rating,
    DENSE_RANK() OVER (ORDER BY COUNT(Booking_ID) DESC, SUM(Booking_Value) DESC) AS customer_rank
FROM bookings
GROUP BY Customer_ID
ORDER BY customer_rank ASC
LIMIT 5;


-- --------------------------------------------------------------------
-- QUERY 5: Driver Cancellations Due to Personal & Car-Related Issues
-- Business Context: Quantify supply-side vehicle downtime and mechanic issues.
-- --------------------------------------------------------------------
SELECT 
    Canceled_Rides_by_Driver AS cancellation_cause,
    COUNT(*) AS cancellation_count,
    ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM bookings WHERE Booking_Status = 'Canceled by Driver'), 2) AS pct_of_driver_cancellations,
    ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM bookings), 2) AS pct_of_all_bookings
FROM bookings
WHERE Canceled_Rides_by_Driver = 'Personal & Car related issue';


-- --------------------------------------------------------------------
-- QUERY 6: Maximum and Minimum Driver Ratings for Prime Sedan Bookings
-- Business Context: Benchmark service variance in the flagship executive tier.
-- --------------------------------------------------------------------
SELECT 
    Vehicle_Type,
    MAX(Driver_Ratings) AS max_driver_rating,
    MIN(Driver_Ratings) AS min_driver_rating,
    ROUND(AVG(Driver_Ratings), 2) AS mean_driver_rating,
    COUNT(*) AS rated_trips_count
FROM bookings 
WHERE Vehicle_Type = 'Prime Sedan' 
  AND Driver_Ratings IS NOT NULL;


-- --------------------------------------------------------------------
-- QUERY 7: Retrieve All Rides Paid Using Unified Payments Interface (UPI)
-- Business Context: Analyze digital transaction adoption and checkout volume.
-- --------------------------------------------------------------------
SELECT 
    Booking_ID,
    Date_Only,
    Customer_ID,
    Vehicle_Type,
    Booking_Value,
    Ride_Distance,
    Pickup_Location,
    Drop_Location
FROM bookings
WHERE Payment_Method = 'UPI';


-- --------------------------------------------------------------------
-- QUERY 8: Average Customer Rating per Vehicle Type
-- Business Context: Compare rider satisfaction scores across fleet segments.
-- --------------------------------------------------------------------
SELECT 
    Vehicle_Type,
    ROUND(AVG(Customer_Rating), 2) AS avg_customer_rating,
    COUNT(Customer_Rating) AS rating_records_count
FROM bookings 
WHERE Customer_Rating IS NOT NULL
GROUP BY Vehicle_Type
ORDER BY avg_customer_rating DESC;


-- --------------------------------------------------------------------
-- QUERY 9: Total Fulfilled Gross Merchandise Value (GMV)
-- Business Context: Measure net operational topline revenue completed in July.
-- --------------------------------------------------------------------
SELECT 
    COUNT(*) AS total_fulfilled_rides,
    SUM(Booking_Value) AS total_fulfilled_revenue_inr,
    ROUND(AVG(Booking_Value), 2) AS average_ticket_size_inr
FROM bookings 
WHERE Booking_Status = 'Success';


-- --------------------------------------------------------------------
-- QUERY 10: Incomplete Journeys Along with Logged Causes
-- Business Context: Audit en-route drop-offs and safety/mechanical stops.
-- --------------------------------------------------------------------
SELECT 
    Booking_ID,
    Customer_ID,
    Vehicle_Type,
    Incomplete_Rides_Reason,
    Booking_Value,
    Ride_Distance,
    Pickup_Location,
    Drop_Location
FROM bookings 
WHERE Incomplete_Rides = 'Yes';


-- --------------------------------------------------------------------
-- ADVANCED QUERY 11: Hourly Demand Profile & Cancellation Friction
-- Business Context: Identify peak failure periods throughout the 24-hour cycle.
-- --------------------------------------------------------------------
SELECT 
    Hour AS hour_of_day,
    COUNT(*) AS total_demand,
    SUM(CASE WHEN Booking_Status = 'Success' THEN 1 ELSE 0 END) AS completed_trips,
    ROUND(SUM(CASE WHEN Booking_Status = 'Success' THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) AS fulfillment_rate_pct,
    SUM(CASE WHEN Booking_Status LIKE 'Canceled%' THEN 1 ELSE 0 END) AS total_cancelled,
    SUM(CASE WHEN Booking_Status = 'Driver Not Found' THEN 1 ELSE 0 END) AS supply_deficit_count
FROM bookings
GROUP BY Hour
ORDER BY Hour ASC;


-- --------------------------------------------------------------------
-- ADVANCED QUERY 12: Top 10 High-Revenue Origin-Destination Corridors
-- Business Context: Optimize dispatch routing and driver incentive positioning.
-- --------------------------------------------------------------------
SELECT 
    Pickup_Location,
    Drop_Location,
    COUNT(*) AS corridor_trips,
    SUM(CASE WHEN Booking_Status = 'Success' THEN 1 ELSE 0 END) AS completed_trips,
    SUM(Booking_Value) AS total_corridor_gmv_inr,
    ROUND(AVG(Ride_Distance), 2) AS avg_distance_km
FROM bookings
GROUP BY Pickup_Location, Drop_Location
ORDER BY corridor_trips DESC
LIMIT 10;
