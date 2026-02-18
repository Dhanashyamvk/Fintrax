def generate_insight(category, amount, confidence):
    insights = []

    if confidence > 0.8:
        insights.append(f"AI is very confident this is {category} spending.")

    if amount > 1000:
        insights.append("High value transaction detected.")

    if category.lower() == "food" and amount > 300:
        insights.append("Food spending is increasing.")

    if category.lower() == "transport" and amount > 200:
        insights.append("Transport expenses look higher than usual.")

    if not insights:
        insights.append("Spending looks normal.")

    return " ".join(insights)
