#!/bin/bash

# OSRM Wrapper Task with Custom Environment Variables
# Configuration based on provided JSON

# Set variables
CLUSTER_ARN="arn:aws:ecs:us-east-2:545009870706:cluster/fleet-mgmt"
TASK_DEFINITION_ARN="arn:aws:ecs:us-east-2:545009870706:task-definition/osrm-wrapper:12"
SECURITY_GROUP="sg-0131a9212be22a5d6"
SUBNET="subnet-09af32d6bff2aa00a"
REGION="us-east-2"
PROFILE="personal"

# Environment variables for orchestrator container
HYPERDECODE_BASE_URL="https://hyper-decode.amaan.click/hyper-decode-api"
SYSTEM_TOKEN="eyJhbGciOiJIUzI1NiJ9.eyJ0ZW5hbnRJZCI6ImdsaW5udGVjaCIsImlhdCI6MTc1MDA4NTg2MiwiaXNzIjoiaHlwZXJkZWNvZGUiLCJhdWQiOiJoeXBlcmRlY29kZS1hcGkiLCJleHAiOjE3NTAxNzIyNjJ9.9x1PhUIjGnQsHjhru0TKVeXrVo5E0m9Y-RqPyN_SSxM"
UPLOAD_TASK_ID="684f894feb95dc8c021b327c"

echo "=== Running OSRM Wrapper Task with Custom Environment ==="
echo "Base URL: $HYPERDECODE_BASE_URL"
echo "Upload Task ID: $UPLOAD_TASK_ID"
echo ""

# Create the overrides JSON
OVERRIDES_JSON=$(cat <<EOF
{
  "containerOverrides": [
    {
      "name": "orchestrator",
      "environment": [
        {
          "name": "HYPERDECODE_BASE_URL",
          "value": "$HYPERDECODE_BASE_URL"
        },
        {
          "name": "SYSTEM_TOKEN",
          "value": "$SYSTEM_TOKEN"
        },
        {
          "name": "UPLOAD_TASK_ID",
          "value": "$UPLOAD_TASK_ID"
        },
        {
        "name": "DEBUG_MODE",
        "value": "true"
        }
      ]
    }
  ]
}
EOF
)

# Run the task with custom environment variables
echo "Starting OSRM wrapper task with custom environment..."
TASK_ARN=$(aws ecs run-task \
    --cluster "$CLUSTER_ARN" \
    --task-definition "$TASK_DEFINITION_ARN" \
    --launch-type FARGATE \
    --count 1 \
    --enable-execute-command \
    --network-configuration "awsvpcConfiguration={subnets=[$SUBNET],securityGroups=[$SECURITY_GROUP],assignPublicIp=ENABLED}" \
    --overrides "$OVERRIDES_JSON" \
    --region "$REGION" \
    --profile "$PROFILE" \
    --query 'tasks[0].taskArn' \
    --output text)

if [ $? -eq 0 ]; then
    echo "✅ Task started successfully!"
    echo "Task ARN: $TASK_ARN"
    
    # Extract just the task ID from the full ARN
    TASK_ID=$(echo "$TASK_ARN" | awk -F'/' '{print $NF}')
    echo "Task ID: $TASK_ID"
    
    # Wait for task to be running
    echo ""
    echo "⏳ Waiting for task to be running..."
    aws ecs wait tasks-running \
        --cluster "$CLUSTER_ARN" \
        --tasks "$TASK_ARN" \
        --region "$REGION" \
        --profile "$PROFILE"
    
    if [ $? -eq 0 ]; then
        echo "✅ Task is now running!"
        
        # Show task details
        echo ""
        echo "=== Task Details ==="
        aws ecs describe-tasks \
            --cluster "$CLUSTER_ARN" \
            --tasks "$TASK_ARN" \
            --region "$REGION" \
            --profile "$PROFILE" \
            --query 'tasks[0].{TaskArn:taskArn,LastStatus:lastStatus,HealthStatus:healthStatus,ConnectivityAt:connectivityAt,PullStartedAt:pullStartedAt,CreatedAt:createdAt}' \
            --output table
        
        # Show container environment verification
        echo ""
        echo "=== Environment Variables Verification ==="
        echo "The orchestrator container has been started with:"
        echo "  HYPERDECODE_BASE_URL: $HYPERDECODE_BASE_URL"
        echo "  SYSTEM_TOKEN: ${SYSTEM_TOKEN:0:30}..."
        echo "  UPLOAD_TASK_ID: $UPLOAD_TASK_ID"
        
        echo ""
        echo "=== Ready for ECS Execute Commands ==="
        echo "Connect to orchestrator container:"
        echo "aws ecs execute-command \\"
        echo "    --cluster \"$CLUSTER_ARN\" \\"
        echo "    --task \"$TASK_ARN\" \\"
        echo "    --container \"orchestrator\" \\"
        echo "    --interactive \\"
        echo "    --command \"/bin/bash\" \\"
        echo "    --region \"$REGION\" \\"
        echo "    --profile \"$PROFILE\""
        echo ""
        echo "Connect to osrm-backend container:"
        echo "aws ecs execute-command \\"
        echo "    --cluster \"$CLUSTER_ARN\" \\"
        echo "    --task \"$TASK_ARN\" \\"
        echo "    --container \"osrm-backend\" \\"
        echo "    --interactive \\"
        echo "    --command \"/bin/bash\" \\"
        echo "    --region \"$REGION\" \\"
        echo "    --profile \"$PROFILE\""
        echo ""
        echo "Stop the task when done:"
        echo "aws ecs stop-task \\"
        echo "    --cluster \"$CLUSTER_ARN\" \\"
        echo "    --task \"$TASK_ARN\" \\"
        echo "    --reason \"Task completed\" \\"
        echo "    --region \"$REGION\" \\"
        echo "    --profile \"$PROFILE\""
        echo ""
        echo "=== Task Information ==="
        echo "Task ARN: $TASK_ARN"
        echo "Task ID: $TASK_ID"
        echo "Upload Task ID: $UPLOAD_TASK_ID"
        
    else
        echo "❌ Task failed to reach running state"
        exit 1
    fi
else
    echo "❌ Failed to start task"
    exit 1
fi
