-- ====================================================================
-- OLA MOBILITY ANALYTICS - RELATIONAL SCHEMA DEFINITION (DDL)
-- ====================================================================
-- Database: SQLite / MySQL Compatible
-- Description: Core table schema for tracking 100k+ ride bookings,
--              customer ratings, vehicle turnaround times, and payments.
-- ====================================================================

DROP TABLE IF EXISTS bookings;

CREATE TABLE bookings (
    Booking_ID                  VARCHAR(32) PRIMARY KEY,
    Date_Only                   DATE NOT NULL,
    Time                        TIME NOT NULL,
    Booking_Status              VARCHAR(32) NOT NULL,
    Customer_ID                 VARCHAR(32) NOT NULL,
    Vehicle_Type                VARCHAR(32) NOT NULL,
    Pickup_Location             VARCHAR(100) NOT NULL,
    Drop_Location               VARCHAR(100) NOT NULL,
    V_TAT                       INTEGER,             -- Vehicle Turnaround Time (seconds)
    C_TAT                       INTEGER,             -- Customer Boarding Turnaround Time (seconds)
    Canceled_Rides_by_Customer  VARCHAR(255),        -- Customer cancellation reason
    Canceled_Rides_by_Driver    VARCHAR(255),        -- Driver cancellation reason
    Incomplete_Rides            VARCHAR(10),         -- 'Yes' or 'No'
    Incomplete_Rides_Reason     VARCHAR(255),        -- Reason if trip was aborted en-route
    Booking_Value               NUMERIC(10, 2),      -- Trip fare / value in INR
    Payment_Method              VARCHAR(32),         -- UPI, Cash, Credit Card, Debit Card
    Ride_Distance               NUMERIC(8, 2),       -- Distance in kilometers
    Driver_Ratings              NUMERIC(3, 2),       -- Driver score (1.0 to 5.0)
    Customer_Rating             NUMERIC(3, 2),       -- Rider score (1.0 to 5.0)
    Hour                        INTEGER,             -- Hour of the day (0-23)
    Day_Name                    VARCHAR(16)          -- Day of week
);

-- ====================================================================
-- OPTIMIZED PERFORMANCE INDEXES
-- ====================================================================
CREATE INDEX IF NOT EXISTS idx_bookings_status   ON bookings(Booking_Status);
CREATE INDEX IF NOT EXISTS idx_bookings_vehicle  ON bookings(Vehicle_Type);
CREATE INDEX IF NOT EXISTS idx_bookings_date     ON bookings(Date_Only);
CREATE INDEX IF NOT EXISTS idx_bookings_hour     ON bookings(Hour);
CREATE INDEX IF NOT EXISTS idx_bookings_customer ON bookings(Customer_ID);
CREATE INDEX IF NOT EXISTS idx_bookings_payment  ON bookings(Payment_Method);
CREATE INDEX IF NOT EXISTS idx_bookings_pickup   ON bookings(Pickup_Location);
CREATE INDEX IF NOT EXISTS idx_bookings_drop     ON bookings(Drop_Location);
