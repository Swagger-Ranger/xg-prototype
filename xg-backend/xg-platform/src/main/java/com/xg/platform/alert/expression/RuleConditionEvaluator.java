package com.xg.platform.alert.expression;

import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Expression evaluator for alert rule conditions and row filters.
 * <p>
 * Grammar:
 *   Expression := OrExpr
 *   OrExpr     := AndExpr ( ('OR'|'or') AndExpr )*
 *   AndExpr    := NotExpr ( ('AND'|'and') NotExpr )*
 *   NotExpr    := ('NOT'|'not') NotExpr | Comparison
 *   Comparison := Primary ( CompOp Primary )?
 *   CompOp     := '>=' | '<=' | '!=' | '==' | '=' | '>' | '<' | ('IN'|'in')
 *   Primary    := Number | String | List | '(' Expression ')' | Identifier | Boolean | 'null'
 *   Identifier := Name ('.' Name)*
 *   List       := '[' Primary (',' Primary)* ']'
 */
@Component
public class RuleConditionEvaluator {

    public boolean evaluate(String expression, Map<String, Object> context) {
        if (expression == null || expression.isBlank()) return true;
        Parser p = new Parser(expression);
        Node ast = p.parseExpression();
        p.skipWs();
        if (!p.isEnd()) {
            throw new ConditionSyntaxException("Unexpected token at position " + p.pos + ": ..." + p.src.substring(p.pos));
        }
        return truthy(eval(ast, context == null ? Map.of() : context));
    }

    public void validateSyntax(String expression) {
        if (expression == null || expression.isBlank()) return;
        Parser p = new Parser(expression);
        p.parseExpression();
        p.skipWs();
        if (!p.isEnd()) {
            throw new ConditionSyntaxException("Unexpected token at position " + p.pos);
        }
    }

    private Object eval(Node n, Map<String, Object> ctx) {
        if (n instanceof Lit l) return l.value;
        if (n instanceof Id id) return ctx.get(id.path);
        if (n instanceof Lst lst) {
            List<Object> out = new ArrayList<>(lst.items.size());
            for (Node item : lst.items) out.add(eval(item, ctx));
            return out;
        }
        if (n instanceof Cmp c) return compareOp(c.op, eval(c.left, ctx), eval(c.right, ctx));
        if (n instanceof And a) return truthy(eval(a.left, ctx)) && truthy(eval(a.right, ctx));
        if (n instanceof Or o) return truthy(eval(o.left, ctx)) || truthy(eval(o.right, ctx));
        if (n instanceof Not n2) return !truthy(eval(n2.inner, ctx));
        throw new IllegalStateException("Unknown node: " + n);
    }

    private static boolean truthy(Object v) {
        if (v == null) return false;
        if (v instanceof Boolean b) return b;
        if (v instanceof Number nm) return nm.doubleValue() != 0.0;
        String s = v.toString();
        return !s.isEmpty() && !"false".equalsIgnoreCase(s) && !"0".equals(s);
    }

    private static Object compareOp(String op, Object l, Object r) {
        if ("in".equals(op)) {
            if (!(r instanceof List<?> list)) return false;
            for (Object x : list) if (eqValue(x, l)) return true;
            return false;
        }
        if ("=".equals(op)) return eqValue(l, r);
        if ("!=".equals(op)) return !eqValue(l, r);
        Double ln = asDouble(l);
        Double rn = asDouble(r);
        if (ln == null || rn == null) return false;
        return switch (op) {
            case ">"  -> ln >  rn;
            case "<"  -> ln <  rn;
            case ">=" -> ln >= rn;
            case "<=" -> ln <= rn;
            default -> false;
        };
    }

    private static boolean eqValue(Object a, Object b) {
        if (a == null && b == null) return true;
        if (a == null || b == null) return false;
        if (a instanceof Boolean || b instanceof Boolean) {
            Double an = asDouble(a instanceof Boolean ba ? (ba ? 1 : 0) : a);
            Double bn = asDouble(b instanceof Boolean bb ? (bb ? 1 : 0) : b);
            if (an != null && bn != null) return an.equals(bn);
        }
        Double an = asDouble(a);
        Double bn = asDouble(b);
        if (an != null && bn != null) return an.equals(bn);
        return a.toString().equals(b.toString());
    }

    private static Double asDouble(Object o) {
        if (o == null) return null;
        if (o instanceof Number n) return n.doubleValue();
        try { return Double.parseDouble(o.toString()); }
        catch (Exception e) { return null; }
    }

    // ----- AST nodes -----
    private sealed interface Node permits Lit, Id, Lst, Cmp, And, Or, Not {}
    private record Lit(Object value) implements Node {}
    private record Id(String path) implements Node {}
    private record Lst(List<Node> items) implements Node {}
    private record Cmp(String op, Node left, Node right) implements Node {}
    private record And(Node left, Node right) implements Node {}
    private record Or(Node left, Node right) implements Node {}
    private record Not(Node inner) implements Node {}

    // ----- Parser -----
    static final class Parser {
        final String src;
        int pos;

        Parser(String src) { this.src = src; this.pos = 0; }

        Node parseExpression() { return parseOr(); }

        Node parseOr() {
            Node left = parseAnd();
            while (matchKeyword("OR")) {
                Node right = parseAnd();
                left = new Or(left, right);
            }
            return left;
        }

        Node parseAnd() {
            Node left = parseNot();
            while (matchKeyword("AND")) {
                Node right = parseNot();
                left = new And(left, right);
            }
            return left;
        }

        Node parseNot() {
            if (matchKeyword("NOT")) return new Not(parseNot());
            return parseComparison();
        }

        Node parseComparison() {
            Node left = parsePrimary();
            skipWs();
            String op = matchCompOp();
            if (op == null) return left;
            Node right = parsePrimary();
            return new Cmp(op, left, right);
        }

        Node parsePrimary() {
            skipWs();
            if (isEnd()) throw new ConditionSyntaxException("Unexpected end at position " + pos);
            char c = src.charAt(pos);
            if (c == '(') {
                pos++;
                Node inner = parseExpression();
                skipWs();
                if (isEnd() || src.charAt(pos) != ')') {
                    throw new ConditionSyntaxException("Missing ')' at position " + pos);
                }
                pos++;
                return inner;
            }
            if (c == '[') return parseList();
            if (c == '\'' || c == '"') return parseString(c);
            if (c == '-' || Character.isDigit(c)) return parseNumber();
            if (Character.isLetter(c) || c == '_') return parseIdOrBool();
            throw new ConditionSyntaxException("Unexpected char '" + c + "' at position " + pos);
        }

        Node parseList() {
            pos++; // [
            skipWs();
            List<Node> items = new ArrayList<>();
            if (!isEnd() && src.charAt(pos) == ']') { pos++; return new Lst(items); }
            while (true) {
                items.add(parsePrimary());
                skipWs();
                if (isEnd()) throw new ConditionSyntaxException("Unclosed list at " + pos);
                char ch = src.charAt(pos);
                if (ch == ',') { pos++; skipWs(); continue; }
                if (ch == ']') { pos++; break; }
                throw new ConditionSyntaxException("Expected ',' or ']' at " + pos);
            }
            return new Lst(items);
        }

        Node parseString(char quote) {
            pos++;
            int start = pos;
            while (!isEnd() && src.charAt(pos) != quote) pos++;
            if (isEnd()) throw new ConditionSyntaxException("Unterminated string");
            String s = src.substring(start, pos);
            pos++;
            return new Lit(s);
        }

        Node parseNumber() {
            int start = pos;
            if (src.charAt(pos) == '-') pos++;
            while (!isEnd() && (Character.isDigit(src.charAt(pos)) || src.charAt(pos) == '.')) pos++;
            return new Lit(new BigDecimal(src.substring(start, pos)));
        }

        Node parseIdOrBool() {
            int start = pos;
            while (!isEnd() && (Character.isLetterOrDigit(src.charAt(pos)) || src.charAt(pos) == '_' || src.charAt(pos) == '.')) pos++;
            String tok = src.substring(start, pos);
            if ("true".equalsIgnoreCase(tok))  return new Lit(Boolean.TRUE);
            if ("false".equalsIgnoreCase(tok)) return new Lit(Boolean.FALSE);
            if ("null".equalsIgnoreCase(tok))  return new Lit(null);
            return new Id(tok);
        }

        String matchCompOp() {
            skipWs();
            if (isEnd()) return null;
            if (matchKeyword("IN")) return "in";
            if (src.startsWith(">=", pos)) { pos += 2; return ">="; }
            if (src.startsWith("<=", pos)) { pos += 2; return "<="; }
            if (src.startsWith("!=", pos)) { pos += 2; return "!="; }
            if (src.startsWith("==", pos)) { pos += 2; return "=";  }
            char c = src.charAt(pos);
            if (c == '>' || c == '<') { pos++; return String.valueOf(c); }
            if (c == '=') { pos++; return "="; }
            return null;
        }

        boolean matchKeyword(String kw) {
            skipWs();
            if (pos + kw.length() > src.length()) return false;
            for (int i = 0; i < kw.length(); i++) {
                if (Character.toLowerCase(src.charAt(pos + i)) != Character.toLowerCase(kw.charAt(i))) return false;
            }
            int after = pos + kw.length();
            if (after < src.length()) {
                char n = src.charAt(after);
                if (Character.isLetterOrDigit(n) || n == '_') return false;
            }
            pos += kw.length();
            return true;
        }

        void skipWs() {
            while (!isEnd() && Character.isWhitespace(src.charAt(pos))) pos++;
        }

        boolean isEnd() { return pos >= src.length(); }
    }
}
