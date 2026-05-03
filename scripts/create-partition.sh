#!/bin/bash
# Catlover Messenger - Partition Management Script
# This script creates monthly partitions for the messages table
# Run this script monthly via cron (e.g., on the 25th of each month)

set -euo pipefail

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Configuration
DB_URL="${DATABASE_URL:-postgresql://localhost:5432/catlover?sslmode=disable}"
TABLE_NAME="messages"
PARTITIONS_AHEAD=2  # Create partitions 2 months in advance
RETENTION_MONTHS=12  # Keep partitions for 12 months, then archive/drop older ones

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Get current date
CURRENT_YEAR=$(date +%Y)
CURRENT_MONTH=$(date +%m)

log_info "Starting partition management for ${TABLE_NAME}"
log_info "Current date: ${CURRENT_YEAR}-${CURRENT_MONTH}"

# Function to create a single partition
create_partition() {
    local year=$1
    local month=$2
    
    # Format month with leading zero
    local month_formatted=$(printf "%02d" $month)
    
    # Calculate next month for the upper bound
    local next_month_year=$year
    local next_month=$((month + 1))
    
    if [ $next_month -gt 12 ]; then
        next_month=1
        next_month_year=$((year + 1))
    fi
    
    local next_month_formatted=$(printf "%02d" $next_month)
    
    local partition_name="${TABLE_NAME}_${year}_${month_formatted}"
    local start_date="${year}-${month_formatted}-01"
    local end_date="${next_month_year}-${next_month_formatted}-01"
    
    log_info "Creating partition: ${partition_name} (${start_date} to ${end_date})"
    
    # Check if partition already exists
    partition_exists=$(psql "$DB_URL" -t -c \
        "SELECT EXISTS(SELECT 1 FROM pg_tables WHERE tablename = '${partition_name}');")
    
    if [ "$partition_exists" = "t" ]; then
        log_warn "Partition ${partition_name} already exists, skipping"
        return 0
    fi
    
    # Create the partition
    psql "$DB_URL" -c \
        "CREATE TABLE IF NOT EXISTS ${partition_name} PARTITION OF ${TABLE_NAME} \
         FOR VALUES FROM ('${start_date}') TO ('${end_date}');"
    
    if [ $? -eq 0 ]; then
        log_info "Successfully created partition ${partition_name}"
        return 0
    else
        log_error "Failed to create partition ${partition_name}"
        return 1
    fi
}

# Function to drop old partitions (for data retention)
drop_old_partitions() {
    local cutoff_year=$1
    local cutoff_month=$2
    
    log_info "Dropping partitions older than ${cutoff_year}-${cutoff_month}"
    
    # Get list of partitions to drop
    partitions_to_drop=$(psql "$DB_URL" -t -c \
        "SELECT tablename FROM pg_tables WHERE tablename LIKE '${TABLE_NAME}_%' \
         AND tablename < '${TABLE_NAME}_${cutoff_year}_${cutoff_month}';")
    
    if [ -z "$partitions_to_drop" ]; then
        log_info "No old partitions to drop"
        return 0
    fi
    
    for partition in $partitions_to_drop; do
        log_warn "Dropping partition: ${partition}"
        psql "$DB_URL" -c "DROP TABLE IF EXISTS ${partition} CASCADE;"
        
        if [ $? -eq 0 ]; then
            log_info "Successfully dropped partition ${partition}"
        else
            log_error "Failed to drop partition ${partition}"
        fi
    done
}

# Create partitions for current and future months
for i in $(seq 0 $PARTITIONS_AHEAD); do
    # Calculate target month
    target_month=$((CURRENT_MONTH + i))
    target_year=$CURRENT_YEAR
    
    while [ $target_month -gt 12 ]; do
        target_month=$((target_month - 12))
        target_year=$((target_year + 1))
    done
    
    create_partition $target_year $target_month
done

# Drop partitions older than retention period
retention_month=$((CURRENT_MONTH - RETENTION_MONTHS))
retention_year=$CURRENT_YEAR

while [ $retention_month -le 0 ]; do
    retention_month=$((retention_month + 12))
    retention_year=$((retention_year - 1))
done

drop_old_partitions $retention_year $retention_month

# Create default partition if it doesn't exist (for future dates)
log_info "Ensuring default partition exists"
psql "$DB_URL" -c \
    "CREATE TABLE IF NOT EXISTS ${TABLE_NAME}_default PARTITION OF ${TABLE_NAME} DEFAULT;"

log_info "Partition management completed successfully"

exit 0
