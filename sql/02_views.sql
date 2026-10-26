-- ====================================================================
-- OLA MOBILITY ANALYTICS - REUSABLE ANALYTICAL VIEWS
-- ====================================================================
-- Purpose: Pre-aggregated database views for Power BI direct querying
--          and real-time executive dashboard reporting.
-- ====================================================================

-- 1. Successful Bookings (Fulfilled trips only)
DROP VIEW IF EXISTS vw_successful_bookings;
CREATE VIEW vw_successful_bookings AS
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
    Payment_Method,
    Driver_Ratings,
    Customer_Rating
FROM bookings
WHERE Booking_Status = 'Success';

-- 2. Fleet Category Benchmarks
DROP VIEW IF EXISTS vw_vehicle_performance;
CREATE VIEW vw_vehicle_performance AS
SELECT 
    Vehicle_Type,
    COUNT(*) AS total_rides,
    SUM(CASE WHEN Booking_Status = 'Success' THEN 1 ELSE 0 END) AS successful_rides,
    ROUND(SUM(CASE WHEN Booking_Status = 'Success' THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 2) AS fulfillment_rate_pct,
    ROUND(AVG(CASE WHEN Ride_Distance > 0 THEN Ride_Distance ELSE NULL END), 2) AS avg_distance_km,
    ROUND(AVG(Driver_Ratings), 2) AS avg_driver_rating,
    ROUND(AVG(Customer_Rating), 2) AS avg_customer_rating,
    ROUND(AVG(V_TAT), 1) AS avg_vehicle_tat_sec,
    ROUND(AVG(C_TAT), 1) AS avg_customer_tat_sec,
    SUM(CASE WHEN Booking_Status = 'Success' THEN Booking_Value ELSE 0 END) AS net_revenue_inr
FROM bookings
GROUP BY Vehicle_Type;

-- 3. Payment Method Financial Summary
DROP VIEW IF EXISTS vw_payment_summary;
CREATE VIEW vw_payment_summary AS
SELECT 
    COALESCE(Payment_Method, 'Unspecified / Failed') AS payment_method,
    COUNT(*) AS total_transactions,
    SUM(CASE WHEN Booking_Status = 'Success' THEN Booking_Value ELSE 0 END) AS successful_revenue_inr,
    ROUND(SUM(CASE WHEN Booking_Status = 'Success' THEN Booking_Value ELSE 0 END) * 100.0 / 
         (SELECT SUM(Booking_Value) FROM bookings WHERE Booking_Status = 'Success'), 2) AS revenue_share_pct
FROM bookings
GROUP BY Payment_Method;

-- 4. Driver Cancellation Diagnostic
DROP VIEW IF EXISTS vw_driver_cancellations;
CREATE VIEW vw_driver_cancellations AS
SELECT 
    Canceled_Rides_by_Driver AS cancel_reason,
    COUNT(*) AS total_cases,
    ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM bookings WHERE Booking_Status = 'Canceled by Driver'), 2) AS pct_of_driver_cancels
FROM bookings
WHERE Booking_Status = 'Canceled by Driver' AND Canceled_Rides_by_Driver IS NOT NULL
GROUP BY Canceled_Rides_by_Driver;

-- 5. Customer Cancellation Diagnostic
DROP VIEW IF EXISTS vw_customer_cancellations;
CREATE VIEW vw_customer_cancellations AS
SELECT 
    Canceled_Rides_by_Customer AS cancel_reason,
    COUNT(*) AS total_cases,
    ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM bookings WHERE Booking_Status = 'Canceled by Customer'), 2) AS pct_of_customer_cancels
FROM bookings
WHERE Booking_Status = 'Canceled by Customer' AND Canceled_Rides_by_Customer IS NOT NULL
GROUP BY Canceled_Rides_by_Customer;
