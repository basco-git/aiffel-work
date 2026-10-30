import products from "../data/products.json";
import styles from "./page.module.css";

const formatPrice = (price) => `${price.toLocaleString("ko-KR")}원`;

export default function Home() {
  return (
    <main className={styles.main}>
      <h1 className={styles.title}>수제 디저트</h1>
      <ul className={styles.grid}>
        {products.map((product) => (
          <li key={product.id} className={styles.card}>
            <div className={styles.imageArea}>
              {product.image ? (
                <img src={product.image} alt={product.name} className={styles.image} />
              ) : (
                <span className={styles.noImage}>이미지 없음</span>
              )}
              {product.soldOut && <span className={styles.soldOut}>품절</span>}
            </div>
            <div className={styles.info}>
              <span className={styles.category}>{product.category}</span>
              <h2 className={styles.name}>{product.name}</h2>
              <p className={styles.price}>{formatPrice(product.price)}</p>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
