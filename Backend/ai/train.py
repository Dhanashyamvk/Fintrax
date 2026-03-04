import pandas as pd
import lightgbm as lgb
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import train_test_split
from scipy.sparse import hstack, csr_matrix
import pickle
import os

BASE_DIR = os.path.dirname(__file__)
csv_path = os.path.join(BASE_DIR,"transactions.csv")

data = pd.read_csv(csv_path)

data = data.dropna()

# Clean description
data["description"] = data["description"].astype(str).str.lower().str.strip()

# -------- TEXT FEATURES --------

vectorizer = TfidfVectorizer(
    stop_words="english",
    ngram_range=(1,2),
    max_features=4000
)

X_text = vectorizer.fit_transform(data["description"])

# -------- NUMERIC FEATURES --------

X_num = csr_matrix(data[["amount","month"]].values)

X = hstack([X_text, X_num])

y = data["category"]

# -------- TRAIN CATEGORY MODEL --------

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42
)

model = lgb.LGBMClassifier(
    n_estimators=350,
    learning_rate=0.05,
    max_depth=10,
    verbose=-1
)

model.fit(X_train,y_train)

accuracy = model.score(X_test,y_test)

print("Category Model Accuracy:", accuracy)

pickle.dump((model,vectorizer),
            open(os.path.join(BASE_DIR,"model.pkl"),"wb"))

# -------- FUTURE SPENDING MODEL --------

monthly = data.groupby("month")["amount"].sum().reset_index()

future_X = monthly[["month"]]
future_y = monthly["amount"]

future_model = RandomForestRegressor(
    n_estimators=200,
    random_state=42
)

future_model.fit(future_X, future_y)

pickle.dump(
    future_model,
    open(os.path.join(BASE_DIR,"future_model.pkl"),"wb")
)

print("AI trained successfully")
