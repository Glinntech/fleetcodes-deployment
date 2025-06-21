# OSRM Wrapper Task Commands

## Current Configuration
- **Task Definition ARN**: `arn:aws:ecs:us-east-2:545009870706:task-definition/osrm-wrapper:8`
- **Cluster ARN**: `arn:aws:ecs:us-east-2:545009870706:cluster/fleet-mgmt`
- **Fargate Security Group**: `sg-0131a9212be22a5d6`
- **Subnets**: `subnet-09af32d6bff2aa00a,subnet-023c772461daf9dcd`
- **Region**: `us-east-2`

## 1. Run OSRM Wrapper Task

```bash
aws ecs run-task \
    --cluster "arn:aws:ecs:us-east-2:545009870706:cluster/fleet-mgmt" \
    --task-definition "arn:aws:ecs:us-east-2:545009870706:task-definition/osrm-wrapper:8" \
    --launch-type FARGATE \
    --network-configuration "awsvpcConfiguration={subnets=[subnet-09af32d6bff2aa00a,subnet-023c772461daf9dcd],securityGroups=[sg-0131a9212be22a5d6],assignPublicIp=ENABLED}" \
    --enable-execute-command \
    --region us-east-2 \
    --profile personal
```

## 2. List Running Tasks

```bash
aws ecs list-tasks \
    --cluster "arn:aws:ecs:us-east-2:545009870706:cluster/fleet-mgmt" \
    --region us-east-2 \
    --profile personal
```

## 3. Get Task Details

```bash
# Replace TASK_ID with actual task ID from list-tasks output
aws ecs describe-tasks \
    --cluster "arn:aws:ecs:us-east-2:545009870706:cluster/fleet-mgmt" \
    --tasks "TASK_ID" \
    --region us-east-2 \
    --profile personal
```

## 4. Execute Command in Orchestrator Container

```bash
# Replace TASK_ID with actual task ID
aws ecs execute-command \
    --cluster "arn:aws:ecs:us-east-2:545009870706:cluster/fleet-mgmt" \
    --task "TASK_ID" \
    --container "orchestrator" \
    --interactive \
    --command "/bin/bash" \
    --region us-east-2 \
    --profile personal
```

## 5. Execute Command in OSRM Backend Container

```bash
# Replace TASK_ID with actual task ID
aws ecs execute-command \
    --cluster "arn:aws:ecs:us-east-2:545009870706:cluster/fleet-mgmt" \
    --task "TASK_ID" \
    --container "osrm-backend" \
    --interactive \
    --command "/bin/bash" \
    --region us-east-2 \
    --profile personal
```

## 6. Check ECS Execute Permissions

```bash
# Check if the task role has the required permissions
aws iam get-role-policy \
    --role-name "osrm-wrapper-task-role" \
    --policy-name "osrm-wrapper-ecs-execute-policy" \
    --region us-east-2 \
    --profile personal

# List attached policies for the task role
aws iam list-attached-role-policies \
    --role-name "osrm-wrapper-task-role" \
    --region us-east-2 \
    --profile personal
```

## 7. Stop Task

```bash
# Replace TASK_ID with actual task ID
aws ecs stop-task \
    --cluster "arn:aws:ecs:us-east-2:545009870706:cluster/fleet-mgmt" \
    --task "TASK_ID" \
    --reason "Manual stop" \
    --region us-east-2 \
    --profile personal
```

## Example Complete Workflow

```bash
# 1. Run the task
TASK_ARN=$(aws ecs run-task \
    --cluster "arn:aws:ecs:us-east-2:545009870706:cluster/fleet-mgmt" \
    --task-definition "arn:aws:ecs:us-east-2:545009870706:task-definition/osrm-wrapper:8" \
    --launch-type FARGATE \
    --network-configuration "awsvpcConfiguration={subnets=[subnet-09af32d6bff2aa00a,subnet-023c772461daf9dcd],securityGroups=[sg-0131a9212be22a5d6],assignPublicIp=ENABLED}" \
    --enable-execute-command \
    --region us-east-2 \
    --profile personal \
    --query 'tasks[0].taskArn' \
    --output text)

echo "Task ARN: $TASK_ARN"

# 2. Wait for task to be running
aws ecs wait tasks-running \
    --cluster "arn:aws:ecs:us-east-2:545009870706:cluster/fleet-mgmt" \
    --tasks "$TASK_ARN" \
    --region us-east-2 \
    --profile personal

# 3. Execute command in orchestrator container
aws ecs execute-command \
    --cluster "arn:aws:ecs:us-east-2:545009870706:cluster/fleet-mgmt" \
    --task "$TASK_ARN" \
    --container "orchestrator" \
    --interactive \
    --command "/bin/bash" \
    --region us-east-2 \
    --profile personal
```

## Required IAM Permissions for ECS Execute

The OSRM wrapper task role now includes the following permissions:

### ECS Task Execution Role Policies:
- `AmazonECSTaskExecutionRolePolicy` (managed policy)

### Custom EFS Policy:
- `elasticfilesystem:ClientMount`
- `elasticfilesystem:ClientWrite`
- `elasticfilesystem:ClientRootAccess`
- `elasticfilesystem:DescribeFileSystems`
- `elasticfilesystem:DescribeMountTargets`

### Custom ECS Execute Policy:
- `ssmmessages:CreateControlChannel`
- `ssmmessages:CreateDataChannel`
- `ssmmessages:OpenControlChannel`
- `ssmmessages:OpenDataChannel`

## Notes

1. **Enable Execute Command**: The `--enable-execute-command` flag is required when running the task to enable ECS Execute.

2. **Task Role**: The task must have a task role (not just execution role) with SSM permissions for ECS Execute to work.

3. **Container Requirements**: Containers should have `initProcessEnabled: true` in their Linux parameters (already configured).

4. **Network Access**: The task needs outbound internet access to communicate with SSM service.

5. **Security Groups**: The Fargate security group allows necessary traffic for EFS and HTTP access.
