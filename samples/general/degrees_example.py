import math

def convert_to_degrees (angle_in_radians):
    return angle_in_radians * (180 / math.pi)

def calculate_angle_in_degrees(opposite,hypotenuse):
    angle_in_radians = math.asin(opposite/hypotenuse)
    angle_in_degrees = convert_to_degrees(angle_in_radians)
    
    return angle_in_degrees

print ("Angle is:", calculate_angle_in_degrees(5,10))