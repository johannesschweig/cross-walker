extends CharacterBody2D


const SPEED = 300.0
@onready var sprite_2d: AnimatedSprite2D = %Sprite2D


func _physics_process(delta: float) -> void:

	## Get the input direction and handle the movement/deceleration.
	## As good practice, you should replace UI actions with custom gameplay actions.
	#var direction_x := Input.get_axis("ui_left", "ui_right")
	#var direction_y := Input.get_axis("ui_up", "ui_down")
#
	#if direction_x or direction_y:
		#if direction_x:
			#velocity.x = direction_x * SPEED
		#else:
			#velocity.x = 0
		#if direction_y:
			#velocity.y = direction_y * SPEED
		#else:
			#velocity.y = 0
		##if direction_y or direction_x:
			##velocity.x = move_toward(velocity.x, 0, SPEED)
#
		#move_and_slide()
	velocity = Vector2.ZERO # The player's movement vector.
	if Input.is_action_pressed("ui_up",true):
		sprite_2d.play("up")
		velocity.y = -SPEED
	if Input.is_action_pressed("ui_down",true):
		sprite_2d.play("face_down")
		velocity.y = SPEED
	if Input.is_action_pressed("ui_left",true):
		sprite_2d.play("left")
		velocity.x = -SPEED
	if Input.is_action_pressed("ui_right",true):
		sprite_2d.play("right")
		velocity.x = SPEED
	if velocity.length() > 0:
		move_and_slide()
	pass
