#!/bin/bash

# OSRM Wrapper Task - Ready to Run Commands
# All values are current and ready to execute

# Set variables for easy use
CLUSTER_ARN="arn:aws:ecs:us-east-2:545009870706:cluster/fleet-mgmt"
TASK_DEFINITION_ARN="arn:aws:ecs:us-east-2:545009870706:task-definition/osrm-wrapper:8"
SECURITY_GROUP="sg-0131a9212be22a5d6"
SUBNETS="subnet-09af32d6bff2aa00a,subnet-023c772461daf9dcd"
REGION="us-east-2"
PROFILE="personal"

echo "=== Running OSRM Wrapper Task ==="

# 1. Run the task with ECS Execute enabled
echo "Starting OSRM wrapper task..."
TASK_ARN=$(aws ecs run-task \
    --cluster "$CLUSTER_ARN" \
    --task-definition "$TASK_DEFINITION_ARN" \
    --launch-type FARGATE \
    --network-configuration "awsvpcConfiguration={subnets=[$SUBNETS],securityGroups=[$SECURITY_GROUP],assignPublicIp=ENABLED}" \
    --enable-execute-command \
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
    
    # 2. Wait for task to be running
    echo ""
    echo "⏳ Waiting for task to be running..."
    aws ecs wait tasks-running \
        --cluster "$CLUSTER_ARN" \
        --tasks "$TASK_ARN" \
        --region "$REGION" \
        --profile "$PROFILE"
    
    if [ $? -eq 0 ]; then
        echo "✅ Task is now running!"
        
        # 3. Show task details
        echo ""
        echo "=== Task Details ==="
        aws ecs describe-tasks \
            --cluster "$CLUSTER_ARN" \
            --tasks "$TASK_ARN" \
            --region "$REGION" \
            --profile "$PROFILE" \
            --query 'tasks[0].{TaskArn:taskArn,LastStatus:lastStatus,HealthStatus:healthStatus,ConnectivityAt:connectivityAt,PullStartedAt:pullStartedAt,CreatedAt:createdAt}' \
            --output table
        
        echo ""
        echo "=== Ready for ECS Execute Commands ==="
        echo "Use these commands to connect to the containers:"
        echo ""
        echo "# Connect to orchestrator container:"
        echo "aws ecs execute-command \\"
        echo "    --cluster \"$CLUSTER_ARN\" \\"
        echo "    --task \"$TASK_ARN\" \\"
        echo "    --container \"orchestrator\" \\"
        echo "    --interactive \\"
        echo "    --command \"/bin/bash\" \\"
        echo "    --region \"$REGION\" \\"
        echo "    --profile \"$PROFILE\""
        echo ""
        echo "# Connect to osrm-backend container:"
        echo "aws ecs execute-command \\"
        echo "    --cluster \"$CLUSTER_ARN\" \\"
        echo "    --task \"$TASK_ARN\" \\"
        echo "    --container \"osrm-backend\" \\"
        echo "    --interactive \\"
        echo "    --command \"/bin/bash\" \\"
        echo "    --region \"$REGION\" \\"
        echo "    --profile \"$PROFILE\""
        echo ""
        echo "# Stop the task when done:"
        echo "aws ecs stop-task \\"
        echo "    --cluster \"$CLUSTER_ARN\" \\"
        echo "    --task \"$TASK_ARN\" \\"
        echo "    --reason \"Manual stop\" \\"
        echo "    --region \"$REGION\" \\"
        echo "    --profile \"$PROFILE\""
        echo ""
        echo "=== Task Information ==="
        echo "Task ARN: $TASK_ARN"
        echo "Task ID: $TASK_ID"
        echo "Cluster: $CLUSTER_ARN"
        echo "Security Group: $SECURITY_GROUP"
        echo "Subnets: $SUBNETS"
        
    else
        echo "❌ Task failed to reach running state"
        exit 1
    fi
else
    echo "❌ Failed to start task"
    exit 1
fi
